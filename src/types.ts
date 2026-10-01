// Core data model: every node operates on a list of text rows and produces a list of text rows.
export type Rows = string[];

export type OperationKind =
  | "input"
  | "split"
  | "enclose"
  | "join"
  | "merge"
  | "append"
  | "trim"
  | "replace"
  | "case"
  | "filter"
  | "output";

export interface OperationParams {
  input: { text: string; inputType: "single" | "lines" };
  split: { delimiter: string; useRegex: boolean };
  enclose: { prefix: string; suffix: string };
  join: { delimiter: string };
  merge: { delimiter: string; missingFallback: string };
  append: { mode: "newline" | "inline"; text: string };
  trim: { mode: "both" | "start" | "end" };
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
  append: "Append",
  trim: "Trim",
  replace: "Replace",
  case: "Case",
  filter: "Filter",
  output: "Output",
};

export function defaultParams<K extends OperationKind>(kind: K): OperationParams[K] {
  const defaults: OperationParams = {
    input: { text: "apple,banana\ncarrot,date", inputType: "lines" },
    split: { delimiter: ",", useRegex: false },
    enclose: { prefix: '"', suffix: '"' },
    join: { delimiter: "," },
    merge: { delimiter: " ", missingFallback: "" },
    append: { mode: "newline", text: "" },
    trim: { mode: "both" },
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
      return p.inputType === "lines" ? "Type: Multiple rows" : "Type: Single value";
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
    case "append": {
      const p = data.params as OperationParams["append"];
      return `Mode: ${p.mode === "newline" ? "Next line" : "Inline (end)"}`;
    }
    case "trim": {
      const p = data.params as OperationParams["trim"];
      return `Mode: ${p.mode}`;
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
