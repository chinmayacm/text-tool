import { useState } from "react";
import { isDualOutputKind } from "../types";
import {
  useGraphStore,
  type PreviewCharLimitMode,
  type PreviewDirection,
  type PreviewRowLimitMode,
} from "../store/useGraphStore";
import "./PreviewPanel.css";

export function PreviewPanel() {
  const [outputSlot, setOutputSlot] = useState<"a" | "b">("a");
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
  const rows = selectedNodeId
    ? (isDualOutput ? outputs.get(`${selectedNodeId}:${outputSlot}`) : outputs.get(selectedNodeId)) ?? []
    : [];

  const isSingleLine = rows.length <= 1;
  const isAllSelected = isSingleLine ? previewCharLimitMode === "all" : previewRowLimitMode === "all";
  const hasFileInput = nodes.some(
    (n) => n.data.kind === "input" && (n.data.params as { source?: string }).source === "file"
  );
  const isLazy = !isAllSelected || hasFileInput;
  const prefixLabel = previewDirection === "tail" ? "Last" : "First";
  const dependsOnSort = selectedNodeId ? nodeDependsOnSort(selectedNodeId, nodes, edges) : false;

  function copyToClipboard() {
    navigator.clipboard.writeText(rows.join("\n"));
  }

  function download() {
    const filename = selectedNode?.data.kind === "output"
      ? (selectedNode.data.params as { filename?: string }).filename || "preview.txt"
      : `${selectedNode?.data.label || "preview"}${isDualOutput ? `-${outputSlot.toUpperCase()}` : ""}.txt`;

    const blob = new Blob([rows.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

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
            <span className={`preview__mode-badge ${isSingleLine ? "preview__mode-badge--single" : "preview__mode-badge--rows"}`}>
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

          <div className="preview__meta">
            {!isSingleLine
              ? `${rows.length} row(s) loaded${isLazy ? ` (${previewDirection})` : ""}`
              : `${rows[0]?.length ?? 0} char(s) loaded${isLazy ? ` (${previewDirection})` : ""}`}
          </div>

          {isLazy && dependsOnSort && (
            <div className="preview__lazy-warning" role="status">
              <strong>Lazy sort notice:</strong> Preview sorts only the sampled {previewDirection} slice. Final output may differ—select <strong>All</strong> or run <strong>Process Now</strong> for full sorting.
            </div>
          )}

          <pre className="preview__content">{rows.join("\n") || "(empty)"}</pre>

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

function nodeDependsOnSort(
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
    if (kind === "sort" || kind === "unique" || kind === "compare") return true;
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        stack.push(edge.source);
      }
    }
  }
  return false;
}

