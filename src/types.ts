// Core data model: every node operates on a list of text rows and produces a list of text rows.
export type Rows = string[];

export type OperationKind =
  | "input"
  | "split"
  | "enclose"
  | "join"
  | "merge"
  | "unmerge"
  | "append"
  | "trim"
  | "replace"
  | "case"
  | "filter"
  | "output";

export interface OperationParams {
  input: {
    source: "text" | "file";
    text: string;
    fileName: string;
    fileSize: number;
    inputType: "single" | "lines" | "custom";
    delimiter: string;
  };
  split: { delimiter: string; useRegex: boolean };
  enclose: { prefix: string; suffix: string };
  join: { delimiter: string };
  merge: { delimiter: string; missingFallback: string };
  unmerge: { delimiter: string; occurrence: "first" | "last"; missingFallback: string };
  append: { text: string; scope: "all" | "row" | "insert"; side: "start" | "end"; line: number };
  trim: { mode: "both" | "start" | "end"; chars?: string };
  replace: { find: string; replaceWith: string; useRegex: boolean; all: boolean };
  case: { mode: "upper" | "lower" | "title" | "sentence" };
  filter: { pattern: string; useRegex: boolean; invert: boolean };
  output: { filename: string };
}

export type NodeData<K extends OperationKind = OperationKind> = {
  kind: K;
  label: string;
  params: OperationParams[K];
};

export const OPERATION_LABELS: Record<OperationKind, string> = {
  input: "Input",
  split: "Split",
  enclose: "Enclose",
  join: "Join",
  merge: "Merge",
  unmerge: "Unmerge",
  append: "Append",
  trim: "Trim",
  replace: "Replace",
  case: "Case",
  filter: "Filter",
  output: "Output",
};

export const OPERATION_DESCRIPTIONS: Record<OperationKind, string> = {
  input: "Load pasted text or a CSV/TXT file as rows.",
  split: "Break each row into multiple rows at a delimiter.",
  enclose: "Wrap every row with a prefix and suffix.",
  join: "Combine all rows into a single row with a delimiter.",
  merge: "Pair and join rows from two inputs side-by-side.",
  unmerge: "Split each row at the first or last delimiter into two parallel outputs (A and B).",
  append: "Add text or rows to the start, end, or a specific line.",
  trim: "Remove leading/trailing whitespace or custom symbols from every row.",
  replace: "Find and replace text or regex matches in every row.",
  case: "Convert rows to UPPER, lower, Title, or Sentence case.",
  filter: "Keep or exclude rows matching a text or regex pattern.",
  output: "Process the full graph and copy or download the result.",
};

export function defaultParams<K extends OperationKind>(kind: K): OperationParams[K] {
  const defaults: OperationParams = {
    input: { source: "text", text: "apple,banana\ncarrot,date", fileName: "", fileSize: 0, inputType: "lines", delimiter: "," },
    split: { delimiter: ",", useRegex: false },
    enclose: { prefix: '"', suffix: '"' },
    join: { delimiter: "," },
    merge: { delimiter: " ", missingFallback: "" },
    unmerge: { delimiter: " ", occurrence: "first", missingFallback: "" },
    append: { text: "", scope: "insert", side: "end", line: 0 },
    trim: { mode: "both", chars: "" },
    replace: { find: "", replaceWith: "", useRegex: false, all: true },
    case: { mode: "upper" },
    filter: { pattern: "", useRegex: false, invert: false },
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
      return `Delimiter: "${p.delimiter}"${p.useRegex ? " (regex)" : ""}`;
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
    case "output":
      return "See Preview panel →";
    default:
      return "";
  }
}
