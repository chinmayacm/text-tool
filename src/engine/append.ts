import type { OperationParams, Rows } from "../types";

export type AppendParams = OperationParams["append"];

export function normalizeAppend(params: Partial<AppendParams> & { mode?: string }): AppendParams {
  if (params.scope === "all" || params.scope === "row" || params.scope === "insert") {
    return {
      text: params.text ?? "",
      scope: params.scope,
      side: params.side === "start" ? "start" : "end",
      line: Number.isFinite(params.line) ? Math.max(0, params.line ?? 0) : 0,
    };
  }
  if (params.mode === "inline") {
    return { text: params.text ?? "", scope: "all", side: "end", line: 1 };
  }
  return { text: params.text ?? "", scope: "insert", side: "end", line: 0 };
}

export function applyAppend(input: Rows, secondary: Rows, raw: Partial<AppendParams> & { mode?: string }): Rows {
  const params = normalizeAppend(raw);
  const payload = payloadRows(params, secondary);
  if (payload.length === 0) return input;

  if (params.scope === "all") {
    if (input.length === 0) return payload;
    return input.map((row, index) => joinSide(row, payload.length === 1 ? payload[0] : (payload[index] ?? ""), params.side));
  }

  if (params.scope === "row") {
    const index = Math.max(0, (params.line || 1) - 1);
    const extra = payload.length === 1 ? payload[0] : payload.join("");
    if (index >= input.length) {
      const padded = input.slice();
      while (padded.length < index) padded.push("");
      padded.push(params.side === "start" ? extra : extra);
      return padded;
    }
    return input.map((row, i) => (i === index ? joinSide(row, extra, params.side) : row));
  }

  const insertAt = params.side === "start"
    ? (params.line > 0 ? params.line - 1 : 0)
    : (params.line > 0 ? params.line : input.length);
  const at = Math.max(0, Math.min(insertAt, input.length));
  return [...input.slice(0, at), ...payload, ...input.slice(at)];
}

function payloadRows(params: AppendParams, secondary: Rows): Rows {
  if (secondary.length > 0) return secondary;
  if (!params.text) return [];
  return params.scope === "insert" ? params.text.split("\n") : [params.text];
}

function joinSide(row: string, extra: string, side: AppendParams["side"]): string {
  return side === "start" ? `${extra}${row}` : `${row}${extra}`;
}
