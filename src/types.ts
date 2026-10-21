// Core data model: every node operates on a list of text rows and produces a list of text rows.
export type Rows = string[];

export type OperationKind =
  | "input"
  | "split"
  | "enclose"
  | "join"
  | "merge"
  | "unmerge"
  | "compare"
  | "partition"
  | "slice"
  | "append"
  | "trim"
  | "replace"
  | "case"
  | "filter"
  | "sort"
  | "unique"
  | "number"
  | "extract"
  | "pad"
  | "template"
  | "encode"
  | "stats"
  | "output";

export function isDualInputKind(kind: OperationKind | undefined): boolean {
  return kind === "merge" || kind === "append" || kind === "compare";
}

export function isDualOutputKind(kind: OperationKind | undefined): boolean {
  return kind === "unmerge" || kind === "partition";
}

export type StatMetricKey =
  | "totalRows"
  | "nonEmptyRows"
  | "emptyRows"
  | "uniqueRows"
  | "duplicateRows"
  | "totalWords"
  | "totalChars"
  | "charsWithNewlines"
  | "minRowLen"
  | "maxRowLen"
  | "avgRowLen"
  | "numericCount"
  | "sum"
  | "average"
  | "median"
  | "minValue"
  | "maxValue";

export const TEXT_STAT_METRICS: StatMetricKey[] = [
  "totalRows",
  "nonEmptyRows",
  "emptyRows",
  "uniqueRows",
  "duplicateRows",
  "totalWords",
  "totalChars",
  "charsWithNewlines",
  "minRowLen",
  "maxRowLen",
  "avgRowLen",
];

export const NUMERIC_STAT_METRICS: StatMetricKey[] = [
  "numericCount",
  "sum",
  "average",
  "median",
  "minValue",
  "maxValue",
];

export const ALL_STAT_METRICS: StatMetricKey[] = [...TEXT_STAT_METRICS, ...NUMERIC_STAT_METRICS];

export const STAT_METRIC_LABELS: Record<StatMetricKey, string> = {
  totalRows: "Total rows",
  nonEmptyRows: "Non-empty rows",
  emptyRows: "Empty rows",
  uniqueRows: "Unique rows",
  duplicateRows: "Duplicate rows",
  totalWords: "Total words",
  totalChars: "Total characters",
  charsWithNewlines: "Characters (with newlines)",
  minRowLen: "Min row length",
  maxRowLen: "Max row length",
  avgRowLen: "Avg row length",
  numericCount: "Numeric values",
  sum: "Sum",
  average: "Average",
  median: "Median",
  minValue: "Min value",
  maxValue: "Max value",
};

export interface OperationParams {
  input: {
    source: "text" | "file";
    text: string;
    fileName: string;
    fileSize: number;
    inputType: "single" | "lines" | "custom";
    delimiter: string;
  };
  split: { delimiter: string; useRegex: boolean; quoteAware?: boolean };
  enclose: { prefix: string; suffix: string; skipEmpty?: boolean };
  join: { delimiter: string; skipEmpty?: boolean };
  merge: { delimiter: string; missingFallback: string };
  unmerge: { delimiter: string; occurrence: "first" | "last"; missingFallback: string };
  compare: {
    mode: "diff" | "intersect" | "xor" | "union";
    caseSensitive: boolean;
    unique: boolean;
    trimCompare: boolean;
  };
  partition: {
    pattern: string;
    useRegex: boolean;
    caseSensitive: boolean;
  };
  slice: {
    mode: "skip" | "range" | "step";
    skipStart: number;
    skipEnd: number;
    startLine: number;
    endLine: number;
    step: number;
    offset: number;
  };
  append: { text: string; scope: "all" | "row" | "insert"; side: "start" | "end"; line: number };
  trim: { mode: "both" | "start" | "end"; chars?: string; collapseSpaces?: boolean };
  replace: { find: string; replaceWith: string; useRegex: boolean; all: boolean; caseSensitive?: boolean };
  case: {
    mode:
      | "upper"
      | "lower"
      | "title"
      | "sentence"
      | "camel"
      | "pascal"
      | "snake"
      | "kebab"
      | "constant";
  };
  filter: { pattern: string; useRegex: boolean; invert: boolean; caseSensitive?: boolean; skipEmpty?: boolean };
  sort: {
    scope: "rows" | "delimited" | "both";
    delimiter: string;
    direction: "asc" | "desc";
    mode: "natural" | "alpha" | "numeric" | "length";
    caseSensitive: boolean;
    unique: boolean;
    trimItems: boolean;
  };
  unique: {
    mode: "unique" | "duplicates" | "singles";
    caseSensitive: boolean;
    showCount: boolean;
    countPrefix: string;
  };
  number: {
    start: number;
    step: number;
    padWidth: number;
    side: "start" | "end";
    separator: string;
    skipEmpty: boolean;
  };
  extract: {
    mode: "column" | "between" | "regex";
    delimiter: string;
    column: number;
    trimValues: boolean;
    quoteAware?: boolean;
    startDelim: string;
    endDelim: string;
    pattern: string;
    group: number;
    missingFallback: string;
    dropUnmatched: boolean;
  };
  pad: {
    mode: "padStart" | "padEnd" | "padBoth" | "truncate";
    width: number;
    padChar: string;
    ellipsis: string;
  };
  template: {
    template: string;
    delimiter: string;
    skipEmpty: boolean;
    quoteAware?: boolean;
  };
  encode: {
    format: "base64" | "url" | "html" | "json" | "hex";
    direction: "encode" | "decode";
  };
  stats: {
    mode: "all" | "text" | "numeric" | "frequency" | "custom";
    metrics?: StatMetricKey[];
    includeLabels?: boolean;
    separator: string;
    caseSensitive: boolean;
  };
  output: { filename: string };
}

export type NodeData<K extends OperationKind = OperationKind> = {
  kind: K;
  label: string;
  params: OperationParams[K];
  bypassed?: boolean;
  note?: string;
};

export const OPERATION_LABELS: Record<OperationKind, string> = {
  input: "Input",
  split: "Split",
  enclose: "Enclose",
  join: "Join",
  merge: "Merge",
  unmerge: "Unmerge",
  compare: "Compare",
  partition: "Partition",
  slice: "Slice",
  append: "Append",
  trim: "Trim",
  replace: "Replace",
  case: "Case",
  filter: "Filter",
  sort: "Sort",
  unique: "Unique",
  number: "Number",
  extract: "Extract",
  pad: "Pad / Cut",
  template: "Template",
  encode: "Encode / Decode",
  stats: "Stats",
  output: "Output",
};

export const OPERATION_DESCRIPTIONS: Record<OperationKind, string> = {
  input: "Load pasted text or a CSV/TXT file as rows.",
  split: "Break each row into multiple rows at a delimiter (with optional quote-aware CSV mode).",
  enclose: "Wrap every row with a prefix and suffix.",
  join: "Combine all rows into a single row with a delimiter.",
  merge: "Pair and join rows from two inputs side-by-side.",
  unmerge: "Split each row at the first or last delimiter into two parallel outputs (A and B).",
  compare: "Compare two inputs (A − B difference, A ∩ B intersection, A Δ B symmetric diff, or A ∪ B union).",
  partition: "Route matching rows to Output A and non-matching rows to Output B.",
  slice: "Skip header/footer rows, keep a line range, or sample every Nth row.",
  append: "Add text or rows to the start, end, or a specific line.",
  trim: "Remove leading/trailing whitespace or custom symbols from every row.",
  replace: "Find and replace text or regex matches in every row.",
  case: "Convert rows to UPPER, lower, Title, or Sentence case.",
  filter: "Keep or exclude rows matching a text or regex pattern.",
  sort: "Sort rows vertically, sort delimited items inside each row, or both.",
  unique: "Deduplicate rows in original order, keep only duplicates/singles, or prepend frequency counts.",
  number: "Add sequential row numbers with optional zero-padding and custom separator.",
  extract: "Extract a specific column, text between two delimiters, or a regex capture group.",
  pad: "Pad rows to a fixed character width or truncate long rows with an optional ellipsis.",
  template: "Format each row using {row}, {i}, {i0}, and {col1}, {col2}… placeholders.",
  encode: "Encode or decode every row using Base64, URL (%20), HTML Entities (&amp;), JSON String Escape, or Hex.",
  stats: "Summarize rows using All (text + math), Text & Rows, Numeric aggregations, or a sorted Frequency Table.",
  output: "Process the full graph and copy or download the result.",
};

export function defaultParams<K extends OperationKind>(kind: K): OperationParams[K] {
  const defaults: OperationParams = {
    input: { source: "text", text: "apple,banana\ncarrot,date", fileName: "", fileSize: 0, inputType: "lines", delimiter: "," },
    split: { delimiter: ",", useRegex: false, quoteAware: false },
    enclose: { prefix: '"', suffix: '"', skipEmpty: false },
    join: { delimiter: ",", skipEmpty: false },
    merge: { delimiter: " ", missingFallback: "" },
    unmerge: { delimiter: " ", occurrence: "first", missingFallback: "" },
    compare: { mode: "diff", caseSensitive: false, unique: true, trimCompare: true },
    partition: { pattern: "", useRegex: false, caseSensitive: false },
    slice: { mode: "skip", skipStart: 1, skipEnd: 0, startLine: 1, endLine: 10, step: 2, offset: 1 },
    append: { text: "", scope: "insert", side: "end", line: 0 },
    trim: { mode: "both", chars: "", collapseSpaces: false },
    replace: { find: "", replaceWith: "", useRegex: false, all: true, caseSensitive: true },
    case: { mode: "upper" },
    filter: { pattern: "", useRegex: false, invert: false, caseSensitive: false, skipEmpty: false },
    sort: {
      scope: "rows",
      delimiter: ",",
      direction: "asc",
      mode: "natural",
      caseSensitive: false,
      unique: false,
      trimItems: true,
    },
    unique: {
      mode: "unique",
      caseSensitive: false,
      showCount: false,
      countPrefix: " × ",
    },
    number: {
      start: 1,
      step: 1,
      padWidth: 0,
      side: "start",
      separator: ". ",
      skipEmpty: true,
    },
    extract: {
      mode: "column",
      delimiter: ",",
      column: 1,
      trimValues: true,
      quoteAware: true,
      startDelim: "[",
      endDelim: "]",
      pattern: "(\\d+)",
      group: 1,
      missingFallback: "",
      dropUnmatched: false,
    },
    pad: {
      mode: "padEnd",
      width: 10,
      padChar: " ",
      ellipsis: "…",
    },
    template: {
      template: "{i}. {row}",
      delimiter: ",",
      skipEmpty: true,
      quoteAware: true,
    },
    encode: {
      format: "base64",
      direction: "encode",
    },
    stats: {
      mode: "all",
      metrics: [...ALL_STAT_METRICS],
      includeLabels: true,
      separator: ": ",
      caseSensitive: false,
    },
    output: { filename: "output.txt" },
  };
  return defaults[kind] as OperationParams[K];
}

/** One-line summary of a node's settings, shown compactly on the canvas node. */
export function summarizeNode(data: NodeData<OperationKind>): string {
  switch (data.kind) {
    case "input": {
      const p = data.params as OperationParams["input"];
      const split = p.inputType === "custom" ? `Split: "${p.delimiter || ","}"` : p.inputType === "single" ? "Single value" : "Split: newline";
      if (p.source === "file") return p.fileName ? `${p.fileName} · ${split}` : `File · ${split}`;
      return split;
    }
    case "split": {
      const p = data.params as OperationParams["split"];
      return `Delimiter: "${p.delimiter}"${p.useRegex ? " (regex)" : p.quoteAware ? " (CSV)" : ""}`;
    }
    case "enclose": {
      const p = data.params as OperationParams["enclose"];
      return `${p.prefix}row${p.suffix}`;
    }
    case "join": {
      const p = data.params as OperationParams["join"];
      return `Delimiter: "${p.delimiter}"`;
    }
    case "merge": {
      const p = data.params as OperationParams["merge"];
      return `Delimiter: "${p.delimiter}"`;
    }
    case "unmerge": {
      const p = data.params as OperationParams["unmerge"];
      return `Delimiter: "${p.delimiter}" (${p.occurrence})`;
    }
    case "compare": {
      const p = data.params as OperationParams["compare"];
      const labels: Record<OperationParams["compare"]["mode"], string> = {
        diff: "A − B (Diff)",
        intersect: "A ∩ B (Common)",
        xor: "A Δ B (Symmetric)",
        union: "A ∪ B (Union)",
      };
      return `${labels[p.mode]}${p.unique ? " · unique" : ""}`;
    }
    case "partition": {
      const p = data.params as OperationParams["partition"];
      return p.pattern ? `Match: /${p.pattern}/ → A, rest → B` : "No pattern set";
    }
    case "slice": {
      const p = data.params as OperationParams["slice"];
      if (p.mode === "skip") return `Skip first ${p.skipStart || 0}, last ${p.skipEnd || 0}`;
      if (p.mode === "range") return `Lines ${p.startLine || 1}..${p.endLine || "end"}`;
      return `Every ${p.step || 2} row(s) from #${p.offset || 1}`;
    }
    case "append": {
      const p = data.params as OperationParams["append"];
      const side = p.side === "start" ? "start" : "end";
      if (p.scope === "all") return `Every row, at ${side}`;
      if (p.scope === "row") return `Line ${p.line || 1}, at ${side}`;
      if (p.line > 0) return `Insert ${side === "start" ? "before" : "after"} line ${p.line}`;
      return side === "start" ? "Insert at start" : "Insert at end";
    }
    case "trim": {
      const p = data.params as OperationParams["trim"];
      const target = p.chars ? `"${p.chars}"` : "whitespace";
      return `${p.mode} · ${target}`;
    }
    case "replace": {
      const p = data.params as OperationParams["replace"];
      return p.find ? `"${p.find}" → "${p.replaceWith}"` : "No pattern set";
    }
    case "case": {
      const p = data.params as OperationParams["case"];
      return `Mode: ${p.mode}`;
    }
    case "filter": {
      const p = data.params as OperationParams["filter"];
      return p.pattern ? `${p.invert ? "Exclude" : "Keep"}: /${p.pattern}/` : "No pattern set";
    }
    case "sort": {
      const p = data.params as OperationParams["sort"];
      const dir = p.direction === "desc" ? "Z→A" : "A→Z";
      const scopeLabel =
        p.scope === "delimited"
          ? `by "${p.delimiter || ","}"`
          : p.scope === "both"
            ? `by "${p.delimiter || ","}" + rows`
            : "rows";
      return `${dir} (${p.mode}) · ${scopeLabel}${p.unique ? " · unique" : ""}`;
    }
    case "unique": {
      const p = data.params as OperationParams["unique"];
      const modeLabel = p.mode === "duplicates" ? "Duplicates only" : p.mode === "singles" ? "Singles only" : "Deduplicate";
      return `${modeLabel}${p.showCount ? " · +count" : ""}`;
    }
    case "number": {
      const p = data.params as OperationParams["number"];
      return `Start ${p.start ?? 1}, step ${p.step ?? 1} (${p.side})`;
    }
    case "extract": {
      const p = data.params as OperationParams["extract"];
      if (p.mode === "column") return `Col #${p.column || 1} by "${p.delimiter || ","}"`;
      if (p.mode === "between") return `Between "${p.startDelim}" … "${p.endDelim}"`;
      return `Regex /${p.pattern}/ (group ${p.group ?? 1})`;
    }
    case "pad": {
      const p = data.params as OperationParams["pad"];
      if (p.mode === "truncate") return `Truncate to ${p.width} chars`;
      return `${p.mode} to ${p.width} with "${p.padChar || " "}"`;
    }
    case "template": {
      const p = data.params as OperationParams["template"];
      return p.template || "{row}";
    }
    case "encode": {
      const p = data.params as OperationParams["encode"];
      const fmtLabels: Record<OperationParams["encode"]["format"], string> = {
        base64: "Base64",
        url: "URL",
        html: "HTML Entities",
        json: "JSON String",
        hex: "Hex",
      };
      return `${p.direction === "decode" ? "Decode" : "Encode"} · ${fmtLabels[p.format]}`;
    }
    case "stats": {
      const p = data.params as OperationParams["stats"];
      if (p.mode === "frequency") return "Frequency table";
      const selected = resolveStatMetrics(p);
      if (p.mode === "all" && selected.length === ALL_STAT_METRICS.length) return "All stats (17)";
      if (p.mode === "text" && selected.length === TEXT_STAT_METRICS.length) return "Text & row stats (11)";
      if (p.mode === "numeric" && selected.length === NUMERIC_STAT_METRICS.length) return "Numeric stats (6)";
      if (selected.length === 0) return "No stats selected";
      if (selected.length <= 2) return selected.map((k) => STAT_METRIC_LABELS[k]).join(", ");
      return `${selected.length} stats selected`;
    }
    case "output":
      return "See Preview panel →";
    default:
      return "";
  }
}

export function resolveStatMetrics(params: OperationParams["stats"]): StatMetricKey[] {
  if (Array.isArray(params.metrics)) return params.metrics;
  if (params.mode === "text") return TEXT_STAT_METRICS;
  if (params.mode === "numeric") return NUMERIC_STAT_METRICS;
  return ALL_STAT_METRICS;
}
