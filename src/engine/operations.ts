import {
  NUMERIC_STAT_METRICS,
  resolveStatMetrics,
  STAT_METRIC_LABELS,
  TEXT_STAT_METRICS,
  type NodeData,
  type OperationKind,
  type Rows,
  type StatMetricKey,
} from "../types.ts";
import { applyAppend } from "./append.ts";
import { splitInputText, type PreviewDirection } from "./textSource.ts";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEscapes(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function toRegExp(pattern: string, useRegex: boolean, flags: string): RegExp {
  try {
    return new RegExp(useRegex ? pattern : escapeRegExp(pattern), flags);
  } catch {
    return new RegExp(escapeRegExp(pattern), flags);
  }
}

function splitWords(row: string): string[] {
  return row
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Splits a single row by a literal delimiter while respecting single/double-quoted fields
 * (e.g. `"Smith, John", 42`), optionally unwrapping outer quotes and unescaping `""` / `''`.
 */
export function splitQuoteAware(row: string, delimiter: string, unwrapQuotes = true): string[] {
  if (!delimiter) return [row];
  const parts: string[] = [];
  let current = "";
  let quoteChar: '"' | "'" | null = null;
  let i = 0;

  while (i < row.length) {
    const ch = row[i];
    if (quoteChar !== null) {
      if (ch === "\\" && i + 1 < row.length) {
        current += ch + row[i + 1];
        i += 2;
        continue;
      }
      if (ch === quoteChar) {
        if (row[i + 1] === quoteChar) {
          current += quoteChar + quoteChar;
          i += 2;
          continue;
        }
        quoteChar = null;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quoteChar = ch;
      current += ch;
      i++;
      continue;
    }

    if (row.startsWith(delimiter, i)) {
      parts.push(unwrapQuotedField(current, unwrapQuotes));
      current = "";
      i += delimiter.length;
      continue;
    }

    current += ch;
    i++;
  }

  parts.push(unwrapQuotedField(current, unwrapQuotes));
  return parts;
}

function unwrapQuotedField(field: string, unwrap: boolean): string {
  if (!unwrap) return field;
  const trimmed = field.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = trimmed.slice(1, -1);
      return first === '"'
        ? inner.replace(/""/g, '"').replace(/\\"/g, '"')
        : inner.replace(/''/g, "'").replace(/\\'/g, "'");
    }
  }
  return field;
}

export interface EvaluateOptions {
  rowLimit?: number;
  charLimit?: number;
  direction?: PreviewDirection;
  /** Pre-sliced rows for a file-backed input node. Undefined means "not a file read". */
  fileRows?: Rows;
}

export function runOperation(
  data: NodeData<OperationKind>,
  input: Rows,
  options?: EvaluateOptions,
  secondaryInput: Rows = []
): Rows {
  const direction = options?.direction ?? "head";
  let result: Rows = [];
  switch (data.kind) {
    case "input": {
      const params = data.params as NodeData<"input">["params"];
      if (params.source === "file") {
        result = options?.fileRows ?? [];
        break;
      }
      const inputType = params.inputType ?? "lines";
      if (inputType === "single") {
        const text = params.text ?? "";
        const limit = options?.charLimit && Number.isFinite(options.charLimit) ? options.charLimit : undefined;
        result = [
          limit && text.length > limit
            ? direction === "tail"
              ? text.slice(-limit)
              : text.slice(0, limit)
            : text,
        ];
      } else {
        result = splitInputText(
          params.text ?? "",
          { inputType, delimiter: params.delimiter ?? "," },
          options?.rowLimit,
          direction
        );
      }
      break;
    }
    case "split": {
      const { delimiter, useRegex, quoteAware } = data.params as NodeData<"split">["params"];
      if (!delimiter) {
        result = input;
      } else if (!useRegex && quoteAware) {
        const effectiveDelimiter = delimiter.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
        result = input.flatMap((row) =>
          splitQuoteAware(row, effectiveDelimiter, true)
            .map((part) => part.replace(/^\r?\n+|\r?\n+$/g, ""))
            .filter((part) => part.length > 0)
        );
      } else {
        const effectiveDelimiter = useRegex ? delimiter : delimiter.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
        const re = toRegExp(effectiveDelimiter, useRegex, "g");
        result = input.flatMap((row) =>
          row
            .split(re)
            .map((part) => part.replace(/^\r?\n+|\r?\n+$/g, ""))
            .filter((part) => part.length > 0)
        );
      }
      break;
    }
    case "enclose": {
      const { prefix, suffix, skipEmpty } = data.params as NodeData<"enclose">["params"];
      const pre = decodeEscapes(prefix ?? "");
      const suf = decodeEscapes(suffix ?? "");
      result = input.map((row) => (skipEmpty && row === "" ? row : `${pre}${row}${suf}`));
      break;
    }
    case "join": {
      const { delimiter, skipEmpty } = data.params as NodeData<"join">["params"];
      const rowsToJoin = skipEmpty ? input.filter((r) => r !== "") : input;
      if (rowsToJoin.length === 0) {
        result = [];
      } else {
        result = [rowsToJoin.join(decodeEscapes(delimiter ?? ""))];
      }
      break;
    }
    case "merge": {
      const { delimiter, missingFallback } = data.params as NodeData<"merge">["params"];
      const effDelim = decodeEscapes(delimiter ?? "");
      const inputA = input;
      const inputB = secondaryInput;

      if (inputA.length > 1 && inputB.length === 1) {
        result = inputA.map((a) => `${a}${effDelim}${inputB[0]}`);
      } else if (inputB.length > 1 && inputA.length === 1) {
        result = inputB.map((b) => `${inputA[0]}${effDelim}${b}`);
      } else {
        const maxLen = Math.max(inputA.length, inputB.length);
        result = [];
        for (let i = 0; i < maxLen; i++) {
          const valA = i < inputA.length ? inputA[i] : missingFallback;
          const valB = i < inputB.length ? inputB[i] : missingFallback;
          result.push(`${valA}${effDelim}${valB}`);
        }
      }
      break;
    }
    case "unmerge": {
      return runUnmergeOperation(data.params as NodeData<"unmerge">["params"], input, options).a;
    }
    case "compare": {
      result = runCompareOperation(data.params as NodeData<"compare">["params"], input, secondaryInput);
      break;
    }
    case "partition": {
      return runPartitionOperation(data.params as NodeData<"partition">["params"], input, options).a;
    }
    case "slice": {
      result = runSliceOperation(data.params as NodeData<"slice">["params"], input);
      break;
    }
    case "append": {
      result = applyAppend(input, secondaryInput, data.params as NodeData<"append">["params"]);
      break;
    }
    case "trim": {
      const { mode, chars, collapseSpaces } = data.params as NodeData<"trim">["params"];
      if (!chars) {
        result = input.map((row) => {
          let trimmed = row;
          if (mode === "start") trimmed = row.replace(/^\s+/, "");
          else if (mode === "end") trimmed = row.replace(/\s+$/, "");
          else trimmed = row.trim();
          return collapseSpaces ? trimmed.replace(/[ \t]+/g, " ") : trimmed;
        });
      } else {
        const escaped = chars.replace(/[-\\^\]]/g, "\\$&");
        const startRe = new RegExp(`^[${escaped}]+`);
        const endRe = new RegExp(`[${escaped}]+$`);
        result = input.map((row) => {
          let trimmed = row;
          if (mode === "start") trimmed = row.replace(startRe, "");
          else if (mode === "end") trimmed = row.replace(endRe, "");
          else trimmed = row.replace(startRe, "").replace(endRe, "");
          return collapseSpaces ? trimmed.replace(/[ \t]+/g, " ") : trimmed;
        });
      }
      break;
    }
    case "replace": {
      const { find, replaceWith, useRegex, all, caseSensitive } = data.params as NodeData<"replace">["params"];
      if (!find) {
        result = input;
      } else {
        const isCaseSensitive = caseSensitive ?? true;
        const flags = `${all ? "g" : ""}${isCaseSensitive ? "" : "i"}`;
        const effFind = useRegex ? find : decodeEscapes(find);
        const effReplace = decodeEscapes(replaceWith ?? "");
        const re = toRegExp(effFind, useRegex, flags);
        result = input.map((row) =>
          useRegex ? row.replace(re, effReplace) : row.replace(re, () => effReplace)
        );
      }
      break;
    }
    case "case": {
      const { mode } = data.params as NodeData<"case">["params"];
      result = input.map((row) => {
        if (mode === "upper") return row.toUpperCase();
        if (mode === "lower") return row.toLowerCase();
        if (mode === "title") {
          return row.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
        }
        if (mode === "sentence") {
          return row
            .toLowerCase()
            .replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
        }
        const words = splitWords(row);
        if (words.length === 0) return row;
        if (mode === "camel") {
          return words
            .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
            .join("");
        }
        if (mode === "pascal") {
          return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
        }
        if (mode === "snake") {
          return words.map((w) => w.toLowerCase()).join("_");
        }
        if (mode === "kebab") {
          return words.map((w) => w.toLowerCase()).join("-");
        }
        if (mode === "constant") {
          return words.map((w) => w.toUpperCase()).join("_");
        }
        return row;
      });
      break;
    }
    case "filter": {
      const { pattern, useRegex, invert, caseSensitive, skipEmpty } = data.params as NodeData<"filter">["params"];
      let filtered = skipEmpty ? input.filter((row) => row.trim() !== "") : input;
      if (pattern) {
        const re = toRegExp(pattern, useRegex, caseSensitive ? "" : "i");
        filtered = filtered.filter((row) => re.test(row) !== invert);
      }
      result = filtered;
      break;
    }
    case "sort": {
      result = runSortOperation(data.params as NodeData<"sort">["params"], input);
      break;
    }
    case "unique": {
      result = runUniqueOperation(data.params as NodeData<"unique">["params"], input);
      break;
    }
    case "number": {
      result = runNumberOperation(data.params as NodeData<"number">["params"], input);
      break;
    }
    case "extract": {
      result = runExtractOperation(data.params as NodeData<"extract">["params"], input);
      break;
    }
    case "pad": {
      result = runPadOperation(data.params as NodeData<"pad">["params"], input);
      break;
    }
    case "template": {
      result = runTemplateOperation(data.params as NodeData<"template">["params"], input);
      break;
    }
    case "encode": {
      result = runEncodeOperation(data.params as NodeData<"encode">["params"], input);
      break;
    }
    case "stats": {
      result = runStatsOperation(data.params as NodeData<"stats">["params"], input);
      break;
    }
    case "output":
      result = input;
      break;
    default:
      result = input;
  }

  return applyOutputLimits(result, options);
}

function applyOutputLimits(rows: Rows, options?: EvaluateOptions): Rows {
  const direction = options?.direction ?? "head";
  let result = rows;
  if (options?.rowLimit && Number.isFinite(options.rowLimit) && result.length > options.rowLimit) {
    result = direction === "tail" ? result.slice(-options.rowLimit) : result.slice(0, options.rowLimit);
  }
  if (
    options?.charLimit &&
    Number.isFinite(options.charLimit) &&
    result.length === 1 &&
    result[0].length > options.charLimit
  ) {
    result = [
      direction === "tail" ? result[0].slice(-options.charLimit) : result[0].slice(0, options.charLimit),
    ];
  }
  return result;
}

export function runUnmergeOperation(
  params: NodeData<"unmerge">["params"],
  input: Rows,
  options?: EvaluateOptions
): { a: Rows; b: Rows } {
  const effectiveDelimiter = (params.delimiter ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const occurrence = params.occurrence ?? "first";
  const missingFallback = params.missingFallback ?? "";
  const a: Rows = [];
  const b: Rows = [];

  for (const row of input) {
    if (!effectiveDelimiter) {
      a.push(row);
      b.push(missingFallback);
      continue;
    }
    const idx = occurrence === "last" ? row.lastIndexOf(effectiveDelimiter) : row.indexOf(effectiveDelimiter);
    if (idx === -1) {
      a.push(row);
      b.push(missingFallback);
    } else {
      a.push(row.slice(0, idx));
      b.push(row.slice(idx + effectiveDelimiter.length));
    }
  }

  return {
    a: applyOutputLimits(a, options),
  b: applyOutputLimits(b, options),
  };
}

export function runSortOperation(params: NodeData<"sort">["params"], input: Rows): Rows {
  const scope = params.scope ?? "rows";
  const effectiveDelimiter = (params.delimiter ?? ",").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const trimItems = params.trimItems ?? true;

  let working = input;

  if (scope === "delimited" || scope === "both") {
    if (effectiveDelimiter) {
      working = working.map((row) => {
        const parts = row.split(effectiveDelimiter);
        const normalized = trimItems ? parts.map((p) => p.trim()) : parts;
        return sortItems(normalized, params).join(effectiveDelimiter);
      });
    }
  }

  if (scope === "rows" || scope === "both") {
    working = sortItems(working, params);
  }

  return working;
}

function sortItems(items: string[], params: NodeData<"sort">["params"]): string[] {
  const direction = params.direction ?? "asc";
  const mode = params.mode ?? "natural";
  const caseSensitive = params.caseSensitive ?? false;
  const unique = params.unique ?? false;
  const dir = direction === "desc" ? -1 : 1;

  let list: string[];
  if (unique) {
    const seen = new Set<string>();
    list = [];
    for (const item of items) {
      const key = caseSensitive ? item : item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(item);
      }
    }
  } else {
    list = [...items];
  }

  const naturalCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: caseSensitive ? "variant" : "base",
  });

  list.sort((a, b) => {
    if (mode === "numeric") {
      const trimA = a.trim();
      const trimB = b.trim();
      const numA = trimA === "" ? NaN : Number(trimA);
      const numB = trimB === "" ? NaN : Number(trimB);
      const validA = !Number.isNaN(numA);
      const validB = !Number.isNaN(numB);
      if (validA && validB) {
        if (numA !== numB) return (numA - numB) * dir;
      } else if (validA !== validB) {
        return validA ? -1 : 1;
      }
    } else if (mode === "length") {
      if (a.length !== b.length) {
        return (a.length - b.length) * dir;
      }
    } else if (mode === "alpha") {
      const keyA = caseSensitive ? a : a.toLowerCase();
      const keyB = caseSensitive ? b : b.toLowerCase();
      if (keyA !== keyB) {
        return (keyA < keyB ? -1 : 1) * dir;
      }
      if (caseSensitive && a !== b) {
        return (a < b ? -1 : 1) * dir;
      }
      return 0;
    }

    const cmp = naturalCollator.compare(a, b);
    if (cmp !== 0) return cmp * dir;
    if (caseSensitive && a !== b) {
      return (a < b ? -1 : 1) * dir;
    }
    return 0;
  });

  return list;
}

export function runCompareOperation(
  params: NodeData<"compare">["params"],
  inputA: Rows,
  inputB: Rows
): Rows {
  const mode = params.mode ?? "diff";
  const caseSensitive = params.caseSensitive ?? false;
  const unique = params.unique ?? true;
  const trimCompare = params.trimCompare ?? true;

  const normalize = (s: string) => {
    const trimmed = trimCompare ? s.trim() : s;
    return caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  const setB = new Set(inputB.map(normalize));
  const setA = new Set(inputA.map(normalize));

  let raw: Rows = [];
  if (mode === "diff") {
    raw = inputA.filter((row) => !setB.has(normalize(row)));
  } else if (mode === "intersect") {
    raw = inputA.filter((row) => setB.has(normalize(row)));
  } else if (mode === "xor") {
    raw = [
      ...inputA.filter((row) => !setB.has(normalize(row))),
      ...inputB.filter((row) => !setA.has(normalize(row))),
    ];
  } else {
    raw = [...inputA, ...inputB];
  }

  if (!unique) return raw;
  const seen = new Set<string>();
  const out: Rows = [];
  for (const row of raw) {
    const key = normalize(row);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimCompare ? row.trim() : row);
    }
  }
  return out;
}

export function runPartitionOperation(
  params: NodeData<"partition">["params"],
  input: Rows,
  options?: EvaluateOptions
): { a: Rows; b: Rows } {
  const pattern = params.pattern ?? "";
  const useRegex = params.useRegex ?? false;
  const caseSensitive = params.caseSensitive ?? false;

  if (!pattern) {
    return {
      a: applyOutputLimits(input, options),
      b: [],
    };
  }

  const re = toRegExp(pattern, useRegex, caseSensitive ? "" : "i");
  const a: Rows = [];
  const b: Rows = [];
  for (const row of input) {
    if (re.test(row)) {
      a.push(row);
    } else {
      b.push(row);
    }
  }

  return {
    a: applyOutputLimits(a, options),
    b: applyOutputLimits(b, options),
  };
}

export function runSliceOperation(params: NodeData<"slice">["params"], input: Rows): Rows {
  const mode = params.mode ?? "skip";
  if (mode === "skip") {
    const skipStart = Math.max(0, params.skipStart ?? 0);
    const skipEnd = Math.max(0, params.skipEnd ?? 0);
    const endIdx = skipEnd > 0 ? Math.max(skipStart, input.length - skipEnd) : input.length;
    return input.slice(skipStart, endIdx);
  }
  if (mode === "range") {
    const startIdx = Math.max(0, (params.startLine || 1) - 1);
    const endLine = params.endLine ?? 0;
    const endIdx = endLine > 0 ? endLine : input.length;
    return input.slice(startIdx, endIdx);
  }
  const step = Math.max(1, params.step || 1);
  const startIdx = Math.max(0, (params.offset || 1) - 1);
  const out: Rows = [];
  for (let i = startIdx; i < input.length; i += step) {
    out.push(input[i]);
  }
  return out;
}

export function runUniqueOperation(params: NodeData<"unique">["params"], input: Rows): Rows {
  const mode = params.mode ?? "unique";
  const caseSensitive = params.caseSensitive ?? false;
  const showCount = params.showCount ?? false;
  const countPrefix = params.countPrefix ?? " × ";

  const counts = new Map<string, number>();
  const firstRowByKey = new Map<string, string>();
  for (const row of input) {
    const key = caseSensitive ? row : row.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstRowByKey.has(key)) {
      firstRowByKey.set(key, row);
    }
  }

  const out: Rows = [];
  for (const [key, representative] of firstRowByKey.entries()) {
    const count = counts.get(key) ?? 1;
    if (mode === "duplicates" && count < 2) continue;
    if (mode === "singles" && count !== 1) continue;
    out.push(showCount ? `${count}${countPrefix}${representative}` : representative);
  }
  return out;
}

export function runNumberOperation(params: NodeData<"number">["params"], input: Rows): Rows {
  const start = params.start ?? 1;
  const step = params.step ?? 1;
  const padWidth = Math.max(0, params.padWidth ?? 0);
  const side = params.side ?? "start";
  const separator = params.separator ?? ". ";
  const skipEmpty = params.skipEmpty ?? true;

  let current = start;
  return input.map((row) => {
    if (skipEmpty && row.trim() === "") return row;
    const numStr = padWidth > 0 ? String(current).padStart(padWidth, "0") : String(current);
    current += step;
    return side === "end" ? `${row}${separator}${numStr}` : `${numStr}${separator}${row}`;
  });
}

export function runExtractOperation(params: NodeData<"extract">["params"], input: Rows): Rows {
  const mode = params.mode ?? "column";
  const missingFallback = params.missingFallback ?? "";
  const dropUnmatched = params.dropUnmatched ?? false;
  const out: Rows = [];

  if (mode === "column") {
    const delim = (params.delimiter ?? ",").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    const col = params.column || 1;
    const trimValues = params.trimValues ?? true;
    const quoteAware = params.quoteAware ?? false;
    for (const row of input) {
      const parts = delim
        ? quoteAware
          ? splitQuoteAware(row, delim, true)
          : row.split(delim)
        : [row];
      const idx = col < 0 ? parts.length + col : col - 1;
      if (idx >= 0 && idx < parts.length) {
        const val = parts[idx];
        out.push(trimValues ? val.trim() : val);
      } else if (!dropUnmatched) {
        out.push(missingFallback);
      }
    }
    return out;
  }

  if (mode === "between") {
    const startDelim = (params.startDelim ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    const endDelim = (params.endDelim ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    for (const row of input) {
      const startIdx = startDelim ? row.indexOf(startDelim) : 0;
      if (startIdx === -1) {
        if (!dropUnmatched) out.push(missingFallback);
        continue;
      }
      const from = startIdx + startDelim.length;
      const endIdx = endDelim ? row.indexOf(endDelim, from) : row.length;
      if (endIdx === -1) {
        if (!dropUnmatched) out.push(missingFallback);
        continue;
      }
      out.push(row.slice(from, endIdx));
    }
    return out;
  }

  // mode === "regex"
  const pattern = params.pattern ?? "";
  if (!pattern) return input;
  const re = toRegExp(pattern, true, "");
  const groupIdx = Math.max(0, params.group ?? 1);
  for (const row of input) {
    const match = re.exec(row);
    if (match) {
      const val = match[groupIdx] ?? match[0] ?? "";
      out.push(val);
    } else if (!dropUnmatched) {
      out.push(missingFallback);
    }
  }
  return out;
}

export function runPadOperation(params: NodeData<"pad">["params"], input: Rows): Rows {
  const mode = params.mode ?? "padEnd";
  const width = Math.max(0, params.width ?? 10);
  const padChar = (params.padChar || " ")[0] ?? " ";
  const ellipsis = params.ellipsis ?? "";

  return input.map((row) => {
    if (mode === "truncate") {
      if (row.length <= width) return row;
      if (!ellipsis || width <= ellipsis.length) return row.slice(0, width);
      return `${row.slice(0, width - ellipsis.length)}${ellipsis}`;
    }
    if (row.length >= width) return row;
    if (mode === "padStart") return row.padStart(width, padChar);
    if (mode === "padEnd") return row.padEnd(width, padChar);
    const totalPad = width - row.length;
    const leftPad = Math.floor(totalPad / 2);
    return row.padStart(row.length + leftPad, padChar).padEnd(width, padChar);
  });
}

export function runTemplateOperation(params: NodeData<"template">["params"], input: Rows): Rows {
  const tpl = params.template ?? "{row}";
  const delim = (params.delimiter ?? ",").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const skipEmpty = params.skipEmpty ?? true;
  const quoteAware = params.quoteAware ?? false;

  let index = 1;
  return input.map((row) => {
    if (skipEmpty && row === "") return row;
    const currentIndex = index++;
    const rawCols = delim
      ? quoteAware
        ? splitQuoteAware(row, delim, true)
        : row.split(delim)
      : [row];
    const cols = rawCols.map((c) => c.trim());
    return tpl
      .replace(/\{row\}/g, () => row)
      .replace(/\{i\}/g, () => String(currentIndex))
      .replace(/\{i0\}/g, () => String(currentIndex - 1))
      .replace(/\{col(\d+)\}/g, (_, numStr: string) => {
        const colIdx = parseInt(numStr, 10) - 1;
        return colIdx >= 0 && colIdx < cols.length ? cols[colIdx] : "";
      });
  });
}

export function runEncodeOperation(params: NodeData<"encode">["params"], input: Rows): Rows {
  const format = params.format ?? "base64";
  const direction = params.direction ?? "encode";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return input.map((row) => {
    try {
      if (format === "base64") {
        if (direction === "encode") {
          const bytes = encoder.encode(row);
          let binary = "";
          for (const b of bytes) binary += String.fromCharCode(b);
          return btoa(binary);
        }
        const binary = atob(row.trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return decoder.decode(bytes);
      }

      if (format === "url") {
        return direction === "encode" ? encodeURIComponent(row) : decodeURIComponent(row);
      }

      if (format === "html") {
        if (direction === "encode") {
          return row
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }
        return row
          .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
      }

      if (format === "json") {
        if (direction === "encode") {
          return JSON.stringify(row).slice(1, -1);
        }
        const trimmed = row.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return String(JSON.parse(trimmed));
        }
        return String(JSON.parse(`"${row}"`));
      }

      if (format === "hex") {
        if (direction === "encode") {
          const bytes = encoder.encode(row);
          return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        }
        const clean = row.replace(/\s+/g, "");
        const bytes = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < bytes.length; i++) {
          const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
          if (Number.isNaN(byte)) return row;
          bytes[i] = byte;
        }
        return decoder.decode(bytes);
      }

      return row;
    } catch {
      return row;
    }
  });
}

function formatStatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(4)));
}

export function runStatsOperation(params: NodeData<"stats">["params"], input: Rows): Rows {
  const sep = decodeEscapes(params.separator ?? ": ");
  const includeLabels = params.includeLabels ?? true;
  const caseSensitive = params.caseSensitive ?? false;

  if (params.mode === "frequency") {
    const counts = new Map<string, { label: string; count: number }>();
    let totalNonEmpty = 0;
    for (const row of input) {
      const trimmed = row.trim();
      if (!trimmed) continue;
      totalNonEmpty++;
      const key = caseSensitive ? trimmed : trimmed.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { label: trimmed, count: 1 });
      }
    }
    const entries = [...counts.values()].sort((a, b) => b.count - a.count);
    return entries.map(({ label, count }) => {
      if (!includeLabels) return String(count);
      const pct = totalNonEmpty > 0 ? formatStatNumber((count / totalNonEmpty) * 100) : "0";
      return `${label}${sep}${count} (${pct}%)`;
    });
  }

  const selected = new Set<StatMetricKey>(resolveStatMetrics(params));
  if (selected.size === 0) return [];

  const formatRow = (key: StatMetricKey, value: string | number) =>
    includeLabels ? `${STAT_METRIC_LABELS[key]}${sep}${value}` : String(value);

  const out: Rows = [];
  const totalRows = input.length;

  const needsText = TEXT_STAT_METRICS.some((k) => selected.has(k));
  const needsNumeric = NUMERIC_STAT_METRICS.some((k) => selected.has(k));

  if (needsText) {
    let nonEmptyRows = 0;
    let totalWords = 0;
    let totalChars = 0;
    let minLen = totalRows > 0 ? Infinity : 0;
    let maxLen = 0;
    const uniqueSet = new Set<string>();

    for (const row of input) {
      const len = row.length;
      totalChars += len;
      if (len < minLen) minLen = len;
      if (len > maxLen) maxLen = len;

      const trimmed = row.trim();
      if (trimmed.length > 0) {
        nonEmptyRows++;
        totalWords += trimmed.split(/\s+/).length;
      }
      uniqueSet.add(caseSensitive ? row : row.toLowerCase());
    }

    const emptyRows = totalRows - nonEmptyRows;
    const uniqueRows = uniqueSet.size;
    const duplicateRows = totalRows - uniqueRows;
    const avgLen = totalRows > 0 ? totalChars / totalRows : 0;
    const charsWithNewlines = totalChars + Math.max(0, totalRows - 1);

    const textValues: Record<string, string | number> = {
      totalRows,
      nonEmptyRows,
      emptyRows,
      uniqueRows,
      duplicateRows,
      totalWords,
      totalChars,
      charsWithNewlines,
      minRowLen: minLen,
      maxRowLen: maxLen,
      avgRowLen: formatStatNumber(avgLen),
    };

    for (const key of TEXT_STAT_METRICS) {
      if (selected.has(key)) {
        out.push(formatRow(key, textValues[key]));
      }
    }
  }

  if (needsNumeric) {
    const nums: number[] = [];
    for (const row of input) {
      const trimmed = row.trim();
      if (!trimmed) continue;
      const direct = Number(trimmed);
      if (Number.isFinite(direct)) {
        nums.push(direct);
      } else {
        const match = /-?\d+(?:\.\d+)?/.exec(trimmed);
        if (match) {
          const parsed = Number(match[0]);
          if (Number.isFinite(parsed)) nums.push(parsed);
        }
      }
    }

    const count = nums.length;
    let numericValues: Record<string, string | number>;
    if (count === 0) {
      numericValues = {
        numericCount: 0,
        sum: 0,
        average: 0,
        median: 0,
        minValue: 0,
        maxValue: 0,
      };
    } else {
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((acc, v) => acc + v, 0);
      const avg = sum / count;
      const mid = Math.floor(count / 2);
      const median = count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      numericValues = {
        numericCount: count,
        sum: formatStatNumber(sum),
        average: formatStatNumber(avg),
        median: formatStatNumber(median),
        minValue: formatStatNumber(sorted[0]),
        maxValue: formatStatNumber(sorted[count - 1]),
      };
    }

    for (const key of NUMERIC_STAT_METRICS) {
      if (selected.has(key)) {
        out.push(formatRow(key, numericValues[key]));
      }
    }
  }

  return out;
}



