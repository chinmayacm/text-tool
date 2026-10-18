import type { OperationParams, Rows } from "../types";

export const FILE_PREVIEW_ROW_CAP = 200;
export const FILE_PREVIEW_CHAR_CAP = 8_000;
export const FILE_PREVIEW_BYTE_CAP = 256 * 1024;

export type InputParams = OperationParams["input"];
export type PreviewDirection = "head" | "tail";

/** Turns user-typed escapes into real newline and tab characters. */
export function decodeDelimiter(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

export function inputDelimiter(params: Pick<InputParams, "inputType" | "delimiter">): string | null {
  if (params.inputType === "single") return null;
  if (params.inputType === "custom") {
    const decoded = decodeDelimiter(params.delimiter);
    return decoded.length > 0 ? decoded : "\n";
  }
  return "\n";
}

export function splitInputText(
  text: string,
  params: Pick<InputParams, "inputType" | "delimiter">,
  maxRows?: number,
  direction: PreviewDirection = "head"
): Rows {
  const delimiter = inputDelimiter(params);
  if (delimiter == null) return [text];
  const limit = maxRows && Number.isFinite(maxRows) ? Math.max(1, maxRows) : undefined;

  if (params.inputType === "custom" && delimiter !== "\n") {
    if (direction === "tail" && limit) {
      const rows: Rows = [];
      let end = text.length;
      while (end >= 0 && rows.length < limit) {
        const searchFrom = end - delimiter.length;
        const idx = searchFrom >= 0 ? text.lastIndexOf(delimiter, searchFrom) : -1;
        const raw = idx === -1 ? text.slice(0, end) : text.slice(idx + delimiter.length, end);
        const part = raw.replace(/^\r?\n+|\r?\n+$/g, "");
        if (part.length > 0) {
          rows.push(part);
        }
        if (idx === -1) break;
        end = idx;
      }
      return rows.reverse();
    }

    const rows: Rows = [];
    let start = 0;
    while (start <= text.length) {
      const idx = text.indexOf(delimiter, start);
      const raw = idx === -1 ? text.slice(start) : text.slice(start, idx);
      const part = raw.replace(/^\r?\n+|\r?\n+$/g, "");
      if (part.length > 0) {
        rows.push(part);
        if (limit && rows.length >= limit) break;
      }
      if (idx === -1) break;
      start = idx + delimiter.length;
    }
    return rows;
  }

  if (!limit) return text.split(/\r?\n/);

  if (direction === "tail") {
    const rows: Rows = [];
    let end = text.length;
    while (end >= 0 && rows.length < limit) {
      const nlIdx = end > 0 ? text.lastIndexOf("\n", end - 1) : -1;
      const lineEnd = end > 0 && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
      if (nlIdx === -1) {
        rows.push(text.slice(0, lineEnd));
        break;
      }
      rows.push(text.slice(nlIdx + 1, lineEnd));
      end = nlIdx;
    }
    return rows.reverse();
  }

  const rows: Rows = [];
  let start = 0;
  while (start <= text.length && rows.length < limit) {
    const nlIdx = text.indexOf("\n", start);
    if (nlIdx === -1) {
      rows.push(text.slice(start));
      break;
    }
    const end = nlIdx > start && text.charCodeAt(nlIdx - 1) === 13 ? nlIdx - 1 : nlIdx;
    rows.push(text.slice(start, end));
    start = nlIdx + 1;
  }
  return rows;
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads only enough of a file for preview. Stops at the row/char cap or a byte cap,
 * so a large CSV/TXT is never fully pulled into memory for the live preview.
 */
export async function readPreviewText(
  file: Blob,
  params: Pick<InputParams, "inputType" | "delimiter">,
  rowLimit: number | undefined,
  charLimit: number | undefined,
  direction: PreviewDirection = "head"
): Promise<string> {
  const delimiter = inputDelimiter(params);
  const maxRows = Math.min(rowLimit ?? FILE_PREVIEW_ROW_CAP, FILE_PREVIEW_ROW_CAP);
  const maxChars = Math.min(charLimit ?? FILE_PREVIEW_CHAR_CAP, FILE_PREVIEW_CHAR_CAP);

  if (direction === "tail") {
    const startOffset = Math.max(0, file.size - FILE_PREVIEW_BYTE_CAP);
    const tailSlice = file.slice(startOffset, file.size);
    let text = await tailSlice.text();
    if (delimiter == null) {
      return text.length > maxChars ? text.slice(-maxChars) : text;
    }
    if (startOffset > 0) {
      const firstDelim = text.indexOf(delimiter);
      if (firstDelim !== -1) {
        text = text.slice(firstDelim + delimiter.length);
      }
    }
    const parts = text.split(delimiter);
    return parts.slice(-maxRows).join(delimiter);
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let hitCap = false;

  try {
    while (bytes < FILE_PREVIEW_BYTE_CAP) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        break;
      }
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (delimiter == null) {
        if (text.length >= maxChars) {
          text = text.slice(0, maxChars);
          hitCap = true;
          break;
        }
      } else if (countComplete(text, delimiter) >= maxRows) {
        text = text.split(delimiter).slice(0, maxRows).join(delimiter);
        hitCap = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (!hitCap && bytes >= FILE_PREVIEW_BYTE_CAP && delimiter) {
    const parts = text.split(delimiter);
    if (parts.length > 1) text = parts.slice(0, Math.min(parts.length - 1, maxRows)).join(delimiter);
  } else if (delimiter == null && text.length > maxChars) {
    text = text.slice(0, maxChars);
  }
  return text;
}

/** Streams a file into rows without also keeping a second copy in node settings. */
export async function readFileRows(file: Blob, params: Pick<InputParams, "inputType" | "delimiter">): Promise<Rows> {
  const delimiter = inputDelimiter(params);
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  if (delimiter == null) {
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          text += decoder.decode();
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return [text];
  }

  const rows: Rows = [];
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        pending += decoder.decode();
        rows.push(pending);
        break;
      }
      pending += decoder.decode(value, { stream: true });
      const parts = pending.split(delimiter);
      pending = parts.pop() ?? "";
      for (const part of parts) rows.push(part);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return rows;
}

function countComplete(text: string, delimiter: string): number {
  if (!delimiter) return text.length;
  return text.split(delimiter).length - 1;
}
