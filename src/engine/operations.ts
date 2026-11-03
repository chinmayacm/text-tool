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
      const { delimiter, skipEmpty, mode, chunkSize } = data.params as NodeData<"join">["params"];
      const rowsToJoin = skipEmpty ? input.filter((r) => r !== "") : input;
      const effDelim = decodeEscapes(delimiter ?? "");
      if (rowsToJoin.length === 0) {
        result = [];
      } else if (mode === "chunk") {
        const size = Math.max(1, chunkSize ?? 2);
        result = [];
        for (let i = 0; i < rowsToJoin.length; i += size) {
          result.push(rowsToJoin.slice(i, i + size).join(effDelim));
        }
      } else {
        result = [rowsToJoin.join(effDelim)];
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
    case "json": {
      result = runJsonOperation(data.params as NodeData<"json">["params"], input);
      break;
    }
    case "columns": {
      result = runColumnsOperation(data.params as NodeData<"columns">["params"], input);
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

export function parseCsvColumns(row: string, delimiter: string, quoteAware = true): string[] {
  const delim = (delimiter ?? ",").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  if (!delim) return [row];
  const raw = quoteAware ? splitQuoteAware(row, delim, true) : row.split(delim);
  return raw.map((c) => c.trim());
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
    const rows = params.skipHeader ? input.slice(1) : input;
    for (const row of rows) {
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
  const rows = params.skipHeader ? input.slice(1) : input;

  let index = 1;
  return rows.map((row) => {
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

function parsePrimitiveValue(raw: string, parsePrimitives: boolean): unknown {
  if (!parsePrimitives) return raw;
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  return raw;
}

function sortJsonKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortJsonKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function tokenizeJsonPath(rawPath: string): string[] {
  const cleaned = rawPath.trim().replace(/^\$\.?/, "").replace(/^\.+/, "");
  if (!cleaned) return [];
  const tokens: string[] = [];
  const re = /([^.[\]]+)|\[(\*|-?\d+|"[^"]*"|'[^']*')\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const token = match[1] ?? match[2] ?? "";
    tokens.push(token.replace(/^["']|["']$/g, ""));
  }
  return tokens;
}

function evaluateJsonPath(root: unknown, tokens: string[]): unknown[] {
  let current: unknown[] = [root];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;
      if (token === "*") {
        if (Array.isArray(item)) next.push(...item);
        else if (typeof item === "object") next.push(...Object.values(item as Record<string, unknown>));
        continue;
      }
      if (Array.isArray(item)) {
        if (/^-?\d+$/.test(token)) {
          const idx = parseInt(token, 10);
          const resolved = idx < 0 ? item.length + idx : idx;
          if (resolved >= 0 && resolved < item.length) {
            next.push(item[resolved]);
          }
        } else {
          for (const elem of item) {
            if (elem !== null && typeof elem === "object" && token in (elem as Record<string, unknown>)) {
              next.push((elem as Record<string, unknown>)[token]);
            }
          }
        }
        continue;
      }
      if (typeof item === "object" && token in (item as Record<string, unknown>)) {
        next.push((item as Record<string, unknown>)[token]);
      }
    }
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

function formatJsonValueToRows(val: unknown, flattenArrays: boolean): Rows {
  if (val === undefined) return [];
  if (val === null) return ["null"];
  if (typeof val === "string") return [val];
  if (typeof val === "number" || typeof val === "boolean") return [String(val)];
  if (Array.isArray(val) && flattenArrays) {
    return val.flatMap((item) => formatJsonValueToRows(item, false));
  }
  return [JSON.stringify(val)];
}

function parseJsonInputEntities(input: Rows): { entities: Array<{ ok: boolean; value: unknown }>; isDocument: boolean } {
  const nonEmpty = input.filter((r) => r.trim().length > 0);
  if (nonEmpty.length === 0) return { entities: [], isDocument: false };

  const perRow = nonEmpty.map((row) => {
    try {
      return { ok: true, value: JSON.parse(row.trim()) };
    } catch {
      return { ok: false, value: null };
    }
  });
  if (perRow.every((r) => r.ok)) {
    return { entities: perRow, isDocument: false };
  }

  const joined = input.join("\n").trim();
  try {
    const doc = JSON.parse(joined);
    return { entities: [{ ok: true, value: doc }], isDocument: true };
  } catch {
    return { entities: perRow, isDocument: false };
  }
}

function flattenJsonToKvRows(value: unknown, prefix: string, sep: string, out: Rows): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries) {
      const nextKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        flattenJsonToKvRows(v, nextKey, sep, out);
      } else if (Array.isArray(v)) {
        out.push(`${nextKey}${sep}${JSON.stringify(v)}`);
      } else {
        out.push(`${nextKey}${sep}${v === null ? "null" : String(v)}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        flattenJsonToKvRows(item, prefix, sep, out);
      } else {
        const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
        out.push(`${key}${sep}${item === null ? "null" : typeof item === "object" ? JSON.stringify(item) : String(item)}`);
      }
    }
  }
}

export function runJsonOperation(params: NodeData<"json">["params"], input: Rows): Rows {
  const mode = params.mode ?? "query";
  const indent = Math.max(0, params.indent ?? 2);
  const sortKeys = params.sortKeys ?? false;
  const kvDelim = decodeEscapes(params.kvDelimiter || ":");
  const parsePrimitives = params.parsePrimitives ?? true;

  if (mode === "kvToJson") {
    const obj: Record<string, unknown> = {};
    for (const row of input) {
      const trimmed = row.trim();
      if (!trimmed) continue;
      const idx = kvDelim ? row.indexOf(kvDelim) : -1;
      if (idx === -1) continue;
      const key = row.slice(0, idx).trim();
      if (!key) continue;
      const rawVal = row.slice(idx + kvDelim.length).trim();
      obj[key] = parsePrimitiveValue(rawVal, parsePrimitives);
    }
    const finalObj = sortKeys ? sortJsonKeysDeep(obj) : obj;
    const jsonStr = indent > 0 ? JSON.stringify(finalObj, null, indent) : JSON.stringify(finalObj);
    return jsonStr.split("\n");
  }

  if (mode === "rowsToJson") {
    const arr = input
      .filter((r) => r.trim().length > 0)
      .map((r) => parsePrimitiveValue(r, parsePrimitives));
    const finalArr = sortKeys ? sortJsonKeysDeep(arr) : arr;
    const jsonStr = indent > 0 ? JSON.stringify(finalArr, null, indent) : JSON.stringify(finalArr);
    return jsonStr.split("\n");
  }

  const { entities, isDocument } = parseJsonInputEntities(input);
  if (entities.length === 0) return [];

  if (mode === "format") {
    const out: Rows = [];
    for (const item of entities) {
      if (!item.ok) continue;
      const target = sortKeys ? sortJsonKeysDeep(item.value) : item.value;
      const formatted = indent > 0 ? JSON.stringify(target, null, indent) : JSON.stringify(target);
      if (indent > 0 && isDocument) {
        out.push(...formatted.split("\n"));
      } else if (indent > 0) {
        out.push(...formatted.split("\n"));
      } else {
        out.push(formatted);
      }
    }
    return out;
  }

  if (mode === "jsonToKv") {
    const out: Rows = [];
    const sep = kvDelim.endsWith(" ") ? kvDelim : `${kvDelim} `;
    for (const item of entities) {
      if (!item.ok) continue;
      flattenJsonToKvRows(item.value, "", sep, out);
    }
    return out;
  }

  // mode === "query"
  const tokens = tokenizeJsonPath(params.path ?? "");
  const flattenArrays = params.flattenArrays ?? true;
  const dropMissing = params.dropMissing ?? true;
  const fallback = params.missingFallback ?? "";
  const out: Rows = [];

  for (const item of entities) {
    if (!item.ok) {
      if (!dropMissing) out.push(fallback);
      continue;
    }
    const matches = tokens.length === 0 ? [item.value] : evaluateJsonPath(item.value, tokens);
    if (matches.length === 0) {
      if (!dropMissing) out.push(fallback);
      continue;
    }
    for (const val of matches) {
      const rows = formatJsonValueToRows(val, flattenArrays);
      if (rows.length > 0) {
        out.push(...rows);
      } else if (!dropMissing) {
        out.push(fallback);
      }
    }
  }
  return out;
}

export function parseColumnSpec(spec: string): number[] {
  return spec
    .split(/[\s,;]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

function formatDelimitedCell(
  cell: string,
  outDelim: string,
  quoteMode: "auto" | "always" | "never"
): string {
  if (quoteMode === "never") return cell;
  if (quoteMode === "always") {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  if (
    (outDelim && cell.includes(outDelim)) ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.includes("\r")
  ) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function runColumnsOperation(params: NodeData<"columns">["params"], input: Rows): Rows {
  if (input.length === 0) return [];
  const delim = decodeEscapes(params.delimiter || ",");
  const quoteAware = params.quoteAware ?? true;
  const trimValues = params.trimValues ?? true;
  const mode = params.mode ?? "keep";
  const spec = parseColumnSpec(params.columns ?? "");
  const outputFormat = params.outputFormat ?? "delimited";
  const outDelim = outputFormat === "tsv" ? "\t" : decodeEscapes(params.outputDelimiter || ",");
  const quoteMode = params.quoteOutput ?? "auto";
  const skipHeader = params.skipHeader ?? false;

  const splitRow = (row: string): string[] => {
    const raw = delim
      ? quoteAware
        ? splitQuoteAware(row, delim, true)
        : row.split(delim)
      : [row];
    return trimValues ? raw.map((c) => c.trim()) : raw;
  };

  const selectCells = (parts: string[]): string[] => {
    if (spec.length === 0) {
      return mode === "drop" ? parts : parts;
    }
    if (mode === "keep") {
      return spec.map((col) => {
        const idx = col < 0 ? parts.length + col : col - 1;
        return idx >= 0 && idx < parts.length ? parts[idx] : "";
      });
    }
    const dropSet = new Set(
      spec.map((col) => (col < 0 ? parts.length + col : col - 1))
    );
    return parts.filter((_, idx) => !dropSet.has(idx));
  };

  if (outputFormat === "json") {
    const nonEmpty = input.filter((r) => r.trim().length > 0);
    if (nonEmpty.length === 0) return [];
    if (skipHeader) {
      const rawHeaders = selectCells(splitRow(nonEmpty[0]));
      const headers = rawHeaders.map((h, i) => h.trim() || `col${i + 1}`);
      const objects = nonEmpty.slice(1).map((row) => {
        const cells = selectCells(splitRow(row));
        const obj: Record<string, unknown> = {};
        headers.forEach((key, idx) => {
          obj[key] = parsePrimitiveValue(cells[idx] ?? "", true);
        });
        return obj;
      });
      return JSON.stringify(objects, null, 2).split("\n");
    }
    const rowsArray = nonEmpty.map((row) =>
      selectCells(splitRow(row)).map((c) => parsePrimitiveValue(c, true))
    );
    return JSON.stringify(rowsArray, null, 2).split("\n");
  }

  const rowsToProcess = skipHeader ? input.slice(1) : input;
  return rowsToProcess.map((row) => {
    if (row.trim() === "") return "";
    const selected = selectCells(splitRow(row));
    return selected.map((c) => formatDelimitedCell(c, outDelim, quoteMode)).join(outDelim);
  });
}



