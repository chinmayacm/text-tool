import { useMemo, useState, type ReactNode } from "react";
import { isDualInputKind, isDualOutputKind, type OperationKind } from "../types";
import { saveTextFile } from "../store/projectPersistence";
import {
  useGraphStore,
  type PreviewCharLimitMode,
  type PreviewDirection,
  type PreviewRowLimitMode,
} from "../store/useGraphStore";
import "./PreviewPanel.css";

const ONE_TO_ONE_KINDS = new Set<OperationKind>([
  "enclose",
  "merge",
  "unmerge",
  "trim",
  "replace",
  "case",
  "number",
  "pad",
  "template",
  "encode",
  "output",
]);

export function PreviewPanel() {
  const [outputSlot, setOutputSlot] = useState<"a" | "b">("a");
  const [showDiff, setShowDiff] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const outputs = useGraphStore((s) => s.outputs);

  const previewRowLimitMode = useGraphStore((s) => s.previewRowLimitMode);
  const previewRowCustom = useGraphStore((s) => s.previewRowCustom);
  const previewCharLimitMode = useGraphStore((s) => s.previewCharLimitMode);
  const previewCharCustom = useGraphStore((s) => s.previewCharCustom);
  const previewDirection = useGraphStore((s) => s.previewDirection);
  const setPreviewRowLimit = useGraphStore((s) => s.setPreviewRowLimit);
  const setPreviewCharLimit = useGraphStore((s) => s.setPreviewCharLimit);
  const setPreviewDirection = useGraphStore((s) => s.setPreviewDirection);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const isDualOutput = isDualOutputKind(selectedNode?.data.kind);
  const rows = useMemo(
    () =>
      selectedNodeId
        ? (isDualOutput ? outputs.get(`${selectedNodeId}:${outputSlot}`) : outputs.get(selectedNodeId)) ?? []
        : [],
    [selectedNodeId, isDualOutput, outputSlot, outputs]
  );

  const canDiff = Boolean(selectedNode && selectedNode.data.kind !== "input");
  const effectiveShowDiff = showDiff && canDiff;

  const incomingRows = useMemo(() => {
    if (!selectedNodeId || !selectedNode || selectedNode.data.kind === "input") return [];
    const inc = edges.filter((e) => e.target === selectedNodeId);
    if (inc.length === 0) return [];
    const primaryEdge = isDualInputKind(selectedNode.data.kind)
      ? inc.find((e) => e.targetHandle === "a") || inc[0]
      : inc[0];
    if (!primaryEdge) return [];
    const sourceNode = nodes.find((n) => n.id === primaryEdge.source);
    if (isDualOutputKind(sourceNode?.data.kind) && primaryEdge.sourceHandle === "b") {
      return outputs.get(`${primaryEdge.source}:b`) ?? [];
    }
    return outputs.get(primaryEdge.source) ?? [];
  }, [selectedNodeId, selectedNode, edges, nodes, outputs]);

  const diffResult = useMemo(() => {
    if (!effectiveShowDiff || !selectedNode) return null;
    const forceOneToOne =
      ONE_TO_ONE_KINDS.has(selectedNode.data.kind) && incomingRows.length === rows.length;
    return computeRowDiff(incomingRows, rows, forceOneToOne);
  }, [effectiveShowDiff, selectedNode, incomingRows, rows]);

  const matchCount = useMemo(() => {
    if (!searchOpen || !searchQuery) return 0;
    let total = 0;
    for (const row of rows) {
      total += countMatches(row, searchQuery, searchCaseSensitive);
    }
    return total;
  }, [rows, searchOpen, searchQuery, searchCaseSensitive]);

  const isSingleLine = rows.length <= 1;
  const isAllSelected = isSingleLine ? previewCharLimitMode === "all" : previewRowLimitMode === "all";
  const hasFileInput = nodes.some(
    (n) => n.data.kind === "input" && (n.data.params as { source?: string }).source === "file"
  );
  const isLazy = !isAllSelected || hasFileInput;
  const prefixLabel = previewDirection === "tail" ? "Last" : "First";
  const dependsOnGlobal = selectedNodeId ? nodeDependsOnGlobalOp(selectedNodeId, nodes, edges) : false;

  function copyToClipboard() {
    navigator.clipboard.writeText(rows.join("\n"));
  }

  function download() {
    const filename =
      selectedNode?.data.kind === "output"
        ? (selectedNode.data.params as { filename?: string }).filename || "preview.txt"
        : `${selectedNode?.data.label || "preview"}${isDualOutput ? `-${outputSlot.toUpperCase()}` : ""}.txt`;

    void saveTextFile(rows.join("\n"), filename);
  }

  const activeQuery = searchOpen ? searchQuery : "";

  return (
    <aside className="preview">
      <div className="preview__header-row">
        <h2>Preview</h2>
        <span
          className={`preview__badge ${isLazy ? "" : "preview__badge--full"}`}
          title={
            isLazy
              ? hasFileInput && isAllSelected
                ? "File preview is capped at 200 rows / 8,000 chars"
                : `Evaluating ${previewDirection === "tail" ? "last" : "first"} items lazily`
              : "Evaluating all data eagerly"
          }
        >
          {isLazy ? (hasFileInput && isAllSelected ? "Lazy (Cap)" : "Lazy") : "Full"}
        </span>
      </div>

      {selectedNode ? (
        <>
          <div className="preview__node-row">
            <p className="preview__node-name">{selectedNode.data.label}</p>
            <span
              className={`preview__mode-badge ${isSingleLine ? "preview__mode-badge--single" : "preview__mode-badge--rows"}`}
            >
              {rows.length === 0 || (rows.length === 1 && rows[0] === "")
                ? "Empty"
                : isSingleLine
                  ? "Single line"
                  : "Multiline (rows)"}
            </span>
          </div>

          {isDualOutput && (
            <div className="preview__slot-switch" role="group" aria-label="Preview output port">
              <button
                type="button"
                className={outputSlot === "a" ? "is-active preview__slot-btn--a" : "preview__slot-btn--a"}
                onClick={() => setOutputSlot("a")}
              >
                {selectedNode?.data.kind === "partition" ? "Output A (Matched)" : "Output A"}
              </button>
              <button
                type="button"
                className={outputSlot === "b" ? "is-active preview__slot-btn--b" : "preview__slot-btn--b"}
                onClick={() => setOutputSlot("b")}
              >
                {selectedNode?.data.kind === "partition" ? "Output B (Unmatched)" : "Output B"}
              </button>
            </div>
          )}

          <div className="preview__limit-controls">
            {!isSingleLine ? (
              <label>
                Row limit
                <div className="preview__limit-input-group">
                  <select
                    value={previewDirection}
                    disabled={previewRowLimitMode === "all"}
                    onChange={(e) => setPreviewDirection(e.target.value as PreviewDirection)}
                    title="Preview slice direction"
                  >
                    <option value="head">Head</option>
                    <option value="tail">Tail</option>
                  </select>
                  <select
                    value={previewRowLimitMode}
                    onChange={(e) => setPreviewRowLimit(e.target.value as PreviewRowLimitMode)}
                  >
                    <option value="5">{prefixLabel} 5 rows</option>
                    <option value="10">{prefixLabel} 10 rows</option>
                    <option value="50">{prefixLabel} 50 rows</option>
                    <option value="custom">Custom ({prefixLabel.toLowerCase()})…</option>
                    <option value="all">All rows</option>
                  </select>
                  {previewRowLimitMode === "custom" && (
                    <input
                      type="number"
                      min={1}
                      value={previewRowCustom}
                      onChange={(e) => setPreviewRowLimit("custom", parseInt(e.target.value, 10) || 1)}
                    />
                  )}
                </div>
              </label>
            ) : (
              <label>
                Char limit
                <div className="preview__limit-input-group">
                  <select
                    value={previewDirection}
                    disabled={previewCharLimitMode === "all"}
                    onChange={(e) => setPreviewDirection(e.target.value as PreviewDirection)}
                    title="Preview slice direction"
                  >
                    <option value="head">Head</option>
                    <option value="tail">Tail</option>
                  </select>
                  <select
                    value={previewCharLimitMode}
                    onChange={(e) => setPreviewCharLimit(e.target.value as PreviewCharLimitMode)}
                  >
                    <option value="100">{prefixLabel} 100 chars</option>
                    <option value="500">{prefixLabel} 500 chars</option>
                    <option value="1000">{prefixLabel} 1000 chars</option>
                    <option value="custom">Custom ({prefixLabel.toLowerCase()})…</option>
                    <option value="all">All chars</option>
                  </select>
                  {previewCharLimitMode === "custom" && (
                    <input
                      type="number"
                      min={1}
                      value={previewCharCustom}
                      onChange={(e) => setPreviewCharLimit("custom", parseInt(e.target.value, 10) || 1)}
                    />
                  )}
                </div>
              </label>
            )}
          </div>

          <div className="preview__toolbar" role="toolbar" aria-label="Preview display options">
            <div className="preview__meta">
              {!isSingleLine
                ? `${rows.length} row(s)${isLazy ? ` (${previewDirection})` : ""}`
                : `${rows[0]?.length ?? 0} char(s)${isLazy ? ` (${previewDirection})` : ""}`}
            </div>
            <div className="preview__tool-buttons">
              <button
                type="button"
                className={`preview__tool-btn ${effectiveShowDiff ? "is-active" : ""}`}
                disabled={!canDiff}
                onClick={() => setShowDiff((v) => !v)}
                title={
                  canDiff
                    ? "Compare incoming input vs. node output"
                    : "Diff is available on nodes with an incoming input"
                }
              >
                ± Diff
              </button>
              <button
                type="button"
                className={`preview__tool-btn ${showLineNumbers ? "is-active" : ""}`}
                onClick={() => setShowLineNumbers((v) => !v)}
                title="Toggle line numbers"
              >
                #
              </button>
              <button
                type="button"
                className={`preview__tool-btn ${showWhitespace ? "is-active" : ""}`}
                onClick={() => setShowWhitespace((v) => !v)}
                title="Visualize spaces (·) and tabs (→)"
              >
                ·→
              </button>
              <button
                type="button"
                className={`preview__tool-btn ${searchOpen ? "is-active" : ""}`}
                onClick={() => setSearchOpen((v) => !v)}
                title="Find and highlight text in preview"
              >
                Find
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="preview__search-bar">
              <input
                type="text"
                className="preview__search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in preview…"
                aria-label="Find in preview"
              />
              <button
                type="button"
                className={`preview__search-toggle ${searchCaseSensitive ? "is-active" : ""}`}
                onClick={() => setSearchCaseSensitive((v) => !v)}
                title="Match case"
              >
                Aa
              </button>
              <span className="preview__search-count">
                {searchQuery ? `${matchCount} match${matchCount === 1 ? "" : "es"}` : ""}
              </span>
              {searchQuery && (
                <button
                  type="button"
                  className="preview__search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {effectiveShowDiff && diffResult && (
            <div className="preview__diff-summary" aria-live="polite">
              <span className="preview__diff-pill preview__diff-pill--mod" title="Modified rows">
                ~{diffResult.modified} mod
              </span>
              <span className="preview__diff-pill preview__diff-pill--add" title="Added rows">
                +{diffResult.added} add
              </span>
              <span className="preview__diff-pill preview__diff-pill--rem" title="Removed rows">
                −{diffResult.removed} del
              </span>
              <span className="preview__diff-pill preview__diff-pill--eq" title="Unchanged rows">
                ={diffResult.unchanged} same
              </span>
            </div>
          )}

          {isLazy && dependsOnGlobal && (
            <div className="preview__lazy-warning" role="status">
              <strong>Lazy preview notice:</strong> Preview evaluates only the sampled {previewDirection} slice. Final output may differ—select <strong>All</strong> or run <strong>Process Now</strong> for full dataset evaluation.
            </div>
          )}

          <div
            className={`preview__content ${
              showLineNumbers || effectiveShowDiff ? "preview__content--structured" : ""
            }`}
          >
            {effectiveShowDiff && diffResult ? (
              diffResult.items.length === 0 ? (
                <div className="preview__empty">(empty)</div>
              ) : (
                <div className="preview__lines">
                  {diffResult.items.map((item, idx) => {
                    if (item.type === "equal") {
                      return (
                        <div key={idx} className="preview__line preview__line--equal">
                          {showLineNumbers && <span className="preview__gutter">{item.newLine}</span>}
                          <span className="preview__diff-sign"> </span>
                          <span className="preview__line-text">
                            {renderFormattedText(item.text, showWhitespace, activeQuery, searchCaseSensitive)}
                          </span>
                        </div>
                      );
                    }
                    if (item.type === "remove") {
                      return (
                        <div key={idx} className="preview__line preview__line--remove">
                          {showLineNumbers && <span className="preview__gutter">{item.oldLine}</span>}
                          <span className="preview__diff-sign">−</span>
                          <span className="preview__line-text">
                            {renderFormattedText(item.text, showWhitespace, activeQuery, searchCaseSensitive)}
                          </span>
                        </div>
                      );
                    }
                    if (item.type === "add") {
                      return (
                        <div key={idx} className="preview__line preview__line--add">
                          {showLineNumbers && <span className="preview__gutter">{item.newLine}</span>}
                          <span className="preview__diff-sign">+</span>
                          <span className="preview__line-text">
                            {renderFormattedText(item.text, showWhitespace, activeQuery, searchCaseSensitive)}
                          </span>
                        </div>
                      );
                    }
                    const inline = splitInlineDiff(item.before, item.after);
                    return (
                      <div key={idx} className="preview__diff-pair">
                        <div className="preview__line preview__line--remove">
                          {showLineNumbers && <span className="preview__gutter">{item.oldLine}</span>}
                          <span className="preview__diff-sign">−</span>
                          <span className="preview__line-text">
                            {renderFormattedText(inline.prefix, showWhitespace, activeQuery, searchCaseSensitive)}
                            {inline.removed && (
                              <span className="preview__inline-del">
                                {renderFormattedText(
                                  inline.removed,
                                  showWhitespace,
                                  activeQuery,
                                  searchCaseSensitive
                                )}
                              </span>
                            )}
                            {renderFormattedText(inline.suffix, showWhitespace, activeQuery, searchCaseSensitive)}
                          </span>
                        </div>
                        <div className="preview__line preview__line--add">
                          {showLineNumbers && <span className="preview__gutter">{item.newLine}</span>}
                          <span className="preview__diff-sign">+</span>
                          <span className="preview__line-text">
                            {renderFormattedText(inline.prefix, showWhitespace, activeQuery, searchCaseSensitive)}
                            {inline.added && (
                              <span className="preview__inline-ins">
                                {renderFormattedText(inline.added, showWhitespace, activeQuery, searchCaseSensitive)}
                              </span>
                            )}
                            {renderFormattedText(inline.suffix, showWhitespace, activeQuery, searchCaseSensitive)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : rows.length === 0 || (rows.length === 1 && rows[0] === "") ? (
              <div className="preview__empty">(empty)</div>
            ) : showLineNumbers ? (
              <div className="preview__lines">
                {rows.map((row, i) => (
                  <div key={i} className="preview__line">
                    <span className="preview__gutter">{i + 1}</span>
                    <span className="preview__line-text">
                      {renderFormattedText(row, showWhitespace, activeQuery, searchCaseSensitive)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="preview__raw">
                {rows.map((row, i) => (
                  <span key={i}>
                    {i > 0 && "\n"}
                    {renderFormattedText(row, showWhitespace, activeQuery, searchCaseSensitive)}
                  </span>
                ))}
              </pre>
            )}
          </div>

          <div className="preview__actions">
            <button onClick={copyToClipboard}>Copy Preview</button>
            <button onClick={download}>Download Preview</button>
          </div>
        </>
      ) : (
        <p className="preview__hint">Select a node to view its live preview output here.</p>
      )}
    </aside>
  );
}

function nodeDependsOnGlobalOp(
  nodeId: string,
  nodes: Array<{ id: string; data: { kind: string } }>,
  edges: Array<{ source: string; target: string }>
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const kind = nodeById.get(current)?.data.kind;
    if (kind === "sort" || kind === "unique" || kind === "compare" || kind === "stats") return true;
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        stack.push(edge.source);
      }
    }
  }
  return false;
}

type DiffItem =
  | { type: "equal"; text: string; oldLine: number; newLine: number }
  | { type: "remove"; text: string; oldLine: number }
  | { type: "add"; text: string; newLine: number }
  | { type: "modify"; before: string; after: string; oldLine: number; newLine: number };

interface DiffSummary {
  items: DiffItem[];
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

function computeRowDiff(before: string[], after: string[], forceOneToOne: boolean): DiffSummary {
  const items: DiffItem[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  if (forceOneToOne && before.length === after.length) {
    for (let i = 0; i < after.length; i++) {
      if (before[i] === after[i]) {
        unchanged++;
        items.push({ type: "equal", text: after[i], oldLine: i + 1, newLine: i + 1 });
      } else {
        modified++;
        items.push({ type: "modify", before: before[i], after: after[i], oldLine: i + 1, newLine: i + 1 });
      }
    }
    return { items, added, removed, modified, unchanged };
  }

  const n = before.length;
  const m = after.length;

  // Use exact LCS when matrix size is within interactive bounds
  if (n * m <= 62500) {
    const dp = new Uint16Array((n + 1) * (m + 1));
    const width = m + 1;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (before[i] === after[j]) {
          dp[i * width + j] = dp[(i + 1) * width + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * width + j];
          const right = dp[i * width + (j + 1)];
          dp[i * width + j] = down >= right ? down : right;
        }
      }
    }

    const raw: Array<
      | { op: "eq"; text: string; oldLine: number; newLine: number }
      | { op: "del"; text: string; oldLine: number }
      | { op: "ins"; text: string; newLine: number }
    > = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (before[i] === after[j]) {
        raw.push({ op: "eq", text: after[j], oldLine: i + 1, newLine: j + 1 });
        i++;
        j++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
        raw.push({ op: "del", text: before[i], oldLine: i + 1 });
        i++;
      } else {
        raw.push({ op: "ins", text: after[j], newLine: j + 1 });
        j++;
      }
    }
    while (i < n) {
      raw.push({ op: "del", text: before[i], oldLine: i + 1 });
      i++;
    }
    while (j < m) {
      raw.push({ op: "ins", text: after[j], newLine: j + 1 });
      j++;
    }

    // Pair adjacent del + ins blocks into modify items
    let k = 0;
    while (k < raw.length) {
      const cur = raw[k];
      if (cur.op === "eq") {
        unchanged++;
        items.push({ type: "equal", text: cur.text, oldLine: cur.oldLine, newLine: cur.newLine });
        k++;
        continue;
      }
      const dels: Array<{ text: string; oldLine: number }> = [];
      while (k < raw.length && raw[k].op === "del") {
        const d = raw[k] as { op: "del"; text: string; oldLine: number };
        dels.push({ text: d.text, oldLine: d.oldLine });
        k++;
      }
      const ins: Array<{ text: string; newLine: number }> = [];
      while (k < raw.length && raw[k].op === "ins") {
        const a = raw[k] as { op: "ins"; text: string; newLine: number };
        ins.push({ text: a.text, newLine: a.newLine });
        k++;
      }
      const pairs = Math.min(dels.length, ins.length);
      for (let p = 0; p < pairs; p++) {
        modified++;
        items.push({
          type: "modify",
          before: dels[p].text,
          after: ins[p].text,
          oldLine: dels[p].oldLine,
          newLine: ins[p].newLine,
        });
      }
      for (let p = pairs; p < dels.length; p++) {
        removed++;
        items.push({ type: "remove", text: dels[p].text, oldLine: dels[p].oldLine });
      }
      for (let p = pairs; p < ins.length; p++) {
        added++;
        items.push({ type: "add", text: ins[p].text, newLine: ins[p].newLine });
      }
    }

    return { items, added, removed, modified, unchanged };
  }

  // Fallback linear scan for very large un-sliced arrays
  const maxLen = Math.max(n, m);
  for (let idx = 0; idx < maxLen; idx++) {
    if (idx < n && idx < m) {
      if (before[idx] === after[idx]) {
        unchanged++;
        items.push({ type: "equal", text: after[idx], oldLine: idx + 1, newLine: idx + 1 });
      } else {
        modified++;
        items.push({ type: "modify", before: before[idx], after: after[idx], oldLine: idx + 1, newLine: idx + 1 });
      }
    } else if (idx < n) {
      removed++;
      items.push({ type: "remove", text: before[idx], oldLine: idx + 1 });
    } else {
      added++;
      items.push({ type: "add", text: after[idx], newLine: idx + 1 });
    }
  }
  return { items, added, removed, modified, unchanged };
}

function splitInlineDiff(before: string, after: string): {
  prefix: string;
  removed: string;
  added: string;
  suffix: string;
} {
  let start = 0;
  const minLen = Math.min(before.length, after.length);
  while (start < minLen && before[start] === after[start]) {
    start++;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return {
    prefix: before.slice(0, start),
    removed: before.slice(start, endBefore),
    added: after.slice(start, endAfter),
    suffix: before.slice(endBefore),
  };
}

function countMatches(text: string, query: string, caseSensitive: boolean): number {
  if (!query) return 0;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let count = 0;
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + Math.max(1, needle.length);
  }
  return count;
}

function renderFormattedText(
  text: string,
  showWhitespace: boolean,
  query: string,
  caseSensitive: boolean
): ReactNode {
  if (!query && !showWhitespace) return text;

  if (!query) {
    return renderWhitespaceNodes(text, "ws");
  }

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let pos = 0;
  let keyCounter = 0;

  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    if (idx > lastIdx) {
      const slice = text.slice(lastIdx, idx);
      parts.push(
        showWhitespace ? renderWhitespaceNodes(slice, `p-${keyCounter++}`) : slice
      );
    }
    const matched = text.slice(idx, idx + needle.length);
    parts.push(
      <mark key={`m-${keyCounter++}`} className="preview__highlight">
        {showWhitespace ? renderWhitespaceNodes(matched, `mw-${keyCounter}`) : matched}
      </mark>
    );
    lastIdx = idx + needle.length;
    pos = idx + Math.max(1, needle.length);
  }

  if (lastIdx === 0) {
    return showWhitespace ? renderWhitespaceNodes(text, "ws") : text;
  }

  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx);
    parts.push(showWhitespace ? renderWhitespaceNodes(tail, `t-${keyCounter++}`) : tail);
  }

  return parts;
}

function renderWhitespaceNodes(text: string, keyPrefix: string): ReactNode {
  if (!text) return text;
  const tokens = text.split(/([ \t]+)/);
  if (tokens.length === 1) return text;
  return tokens.map((tok, idx) => {
    if (!tok) return null;
    if (tok[0] === " " || tok[0] === "\t") {
      const visual = tok.replace(/ /g, "·").replace(/\t/g, "→   ");
      return (
        <span key={`${keyPrefix}-${idx}`} className="preview__ws">
          {visual}
        </span>
      );
    }
    return tok;
  });
}
