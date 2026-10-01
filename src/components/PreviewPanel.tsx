import { useGraphStore, type PreviewCharLimitMode, type PreviewRowLimitMode } from "../store/useGraphStore";
import "./PreviewPanel.css";

export function PreviewPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const outputs = useGraphStore((s) => s.outputs);

  const previewRowLimitMode = useGraphStore((s) => s.previewRowLimitMode);
  const previewRowCustom = useGraphStore((s) => s.previewRowCustom);
  const previewCharLimitMode = useGraphStore((s) => s.previewCharLimitMode);
  const previewCharCustom = useGraphStore((s) => s.previewCharCustom);
  const setPreviewRowLimit = useGraphStore((s) => s.setPreviewRowLimit);
  const setPreviewCharLimit = useGraphStore((s) => s.setPreviewCharLimit);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const rows = selectedNodeId ? outputs.get(selectedNodeId) ?? [] : [];

  const isSingleLine = rows.length <= 1;

  function copyToClipboard() {
    navigator.clipboard.writeText(rows.join("\n"));
  }

  function download() {
    const filename = selectedNode?.data.kind === "output"
      ? (selectedNode.data.params as { filename?: string }).filename || "preview.txt"
      : `${selectedNode?.data.label || "preview"}.txt`;

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
        <span className="preview__badge">Lazy</span>
      </div>

      {selectedNode ? (
        <>
          <p className="preview__node-name">{selectedNode.data.label}</p>

          <div className="preview__limit-controls">
            {!isSingleLine ? (
              <label>
                Row limit
                <div className="preview__limit-input-group">
                  <select
                    value={previewRowLimitMode}
                    onChange={(e) => setPreviewRowLimit(e.target.value as PreviewRowLimitMode)}
                  >
                    <option value="5">First 5 rows</option>
                    <option value="10">First 10 rows</option>
                    <option value="50">First 50 rows</option>
                    <option value="custom">Custom rows…</option>
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
                    value={previewCharLimitMode}
                    onChange={(e) => setPreviewCharLimit(e.target.value as PreviewCharLimitMode)}
                  >
                    <option value="100">First 100 chars</option>
                    <option value="500">First 500 chars</option>
                    <option value="1000">First 1000 chars</option>
                    <option value="custom">Custom chars…</option>
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
              ? `${rows.length} row(s) loaded`
              : `${rows[0]?.length ?? 0} char(s) loaded`}
          </div>

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
