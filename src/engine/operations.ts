import type { NodeData, OperationKind, Rows } from "../types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toRegExp(pattern: string, useRegex: boolean, flags: string): RegExp {
  return new RegExp(useRegex ? pattern : escapeRegExp(pattern), flags);
}

export interface EvaluateOptions {
  rowLimit?: number;
  charLimit?: number;
}

export function runOperation(
  data: NodeData<OperationKind>,
  input: Rows,
  options?: EvaluateOptions,
  secondaryInput: Rows = []
): Rows {
  let result: Rows = [];
  switch (data.kind) {
    case "input": {
      const { text, inputType } = data.params as NodeData<"input">["params"];
      if (inputType === "lines") {
        const lines = text.split("\n");
        result = options?.rowLimit && Number.isFinite(options.rowLimit)
          ? lines.slice(0, options.rowLimit)
          : lines;
      } else {
        const str = options?.charLimit && Number.isFinite(options.charLimit)
          ? text.slice(0, options.charLimit)
          : text;
        result = [str];
      }
      break;
    }
    case "split": {
      const { delimiter, useRegex } = data.params as NodeData<"split">["params"];
      if (!delimiter) {
        result = input;
      } else {
        const re = toRegExp(delimiter, useRegex, "g");
        result = input.flatMap((row) => row.split(re));
      }
      break;
    }
    case "enclose": {
      const { prefix, suffix } = data.params as NodeData<"enclose">["params"];
      result = input.map((row) => `${prefix}${row}${suffix}`);
      break;
    }
    case "join": {
      const { delimiter } = data.params as NodeData<"join">["params"];
      result = [input.join(delimiter)];
      break;
    }
    case "merge": {
      const { delimiter, missingFallback } = data.params as NodeData<"merge">["params"];
      const inputA = input;
      const inputB = secondaryInput;

      if (inputA.length > 1 && inputB.length === 1) {
        result = inputA.map((a) => `${a}${delimiter}${inputB[0]}`);
      } else if (inputB.length > 1 && inputA.length === 1) {
        result = inputB.map((b) => `${inputA[0]}${delimiter}${b}`);
      } else {
        const maxLen = Math.max(inputA.length, inputB.length);
        result = [];
        for (let i = 0; i < maxLen; i++) {
          const valA = i < inputA.length ? inputA[i] : missingFallback;
          const valB = i < inputB.length ? inputB[i] : missingFallback;
          result.push(`${valA}${delimiter}${valB}`);
        }
      }
      break;
    }
    case "append": {
      const { mode, text } = data.params as NodeData<"append">["params"];
      const inputA = input;
      const inputB =
        secondaryInput.length > 0
          ? secondaryInput
          : text
          ? mode === "newline"
            ? text.split("\n")
            : [text]
          : [];

      if (mode === "newline") {
        result = [...inputA, ...inputB];
      } else {
        if (inputA.length === 0) {
          result = inputB;
        } else if (inputB.length === 1) {
          result = inputA.map((row) => `${row}${inputB[0]}`);
        } else {
          result = inputA.map((row, i) => `${row}${inputB[i] ?? ""}`);
        }
      }
      break;
    }
    case "trim": {
      const { mode } = data.params as NodeData<"trim">["params"];
      result = input.map((row) => {
        if (mode === "start") return row.replace(/^\s+/, "");
        if (mode === "end") return row.replace(/\s+$/, "");
        return row.trim();
      });
      break;
    }
    case "replace": {
      const { find, replaceWith, useRegex, all } = data.params as NodeData<"replace">["params"];
      if (!find) {
        result = input;
      } else {
        const re = toRegExp(find, useRegex, all ? "g" : "");
        result = input.map((row) => row.replace(re, replaceWith));
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
        return row.replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
      });
      break;
    }
    case "filter": {
      const { pattern, useRegex, invert } = data.params as NodeData<"filter">["params"];
      if (!pattern) {
        result = input;
      } else {
        const re = toRegExp(pattern, useRegex, "");
        result = input.filter((row) => re.test(row) !== invert);
      }
      break;
    }
    case "output":
      result = input;
      break;
    default:
      result = input;
  }

  if (options?.rowLimit && Number.isFinite(options.rowLimit) && result.length > options.rowLimit) {
    result = result.slice(0, options.rowLimit);
  }
  if (
    options?.charLimit &&
    Number.isFinite(options.charLimit) &&
    result.length === 1 &&
    result[0].length > options.charLimit
  ) {
    result = [result[0].slice(0, options.charLimit)];
  }

  return result;
}
