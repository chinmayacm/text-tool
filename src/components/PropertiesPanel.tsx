import { useGraphStore } from "../store/useGraphStore";
import type { NodeData } from "../types";
import "./PropertiesPanel.css";

export function PropertiesPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const outputs = useGraphStore((s) => s.outputs);
  const fullOutputs = useGraphStore((s) => s.fullOutputs);
  const isProcessing = useGraphStore((s) => s.isProcessing);
  const lastProcessTime = useGraphStore((s) => s.lastProcessTime);
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams);
  const renameNode = useGraphStore((s) => s.renameNode);
  const processFullGraph = useGraphStore((s) => s.processFullGraph);

  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <section className="properties">
        <h2>Properties</h2>
        <p className="properties__hint">Select a node to edit its settings here.</p>
      </section>
    );
  }

  const data = node.data;
  const kind = data.kind;

  function set(patch: Partial<NodeData["params"]>) {
    updateNodeParams(node!.id, patch);
  }

  function handleCopyOutput() {
    const rows = fullOutputs.get(node!.id) || outputs.get(node!.id) || [];
    navigator.clipboard.writeText(rows.join("\n"));
  }

  function handleDownloadOutput() {
    const rows = fullOutputs.get(node!.id) || outputs.get(node!.id) || [];
    const filename = (data.params as { filename?: string }).filename || "output.txt";
    const blob = new Blob([rows.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="properties">
      <h2>Properties</h2>
      <label className="properties__name">
        Name
        <input value={data.label} onChange={(e) => renameNode(node.id, e.target.value)} />
      </label>
      <div className="properties__body">
        {kind === "input" && (
          <>
            <label>
              Input type
              <select
                value={(data.params as NodeData<"input">["params"]).inputType}
                onChange={(e) => set({ inputType: e.target.value as "single" | "lines" })}
              >
                <option value="lines">Multiple rows (split by newline)</option>
                <option value="single">Single value (whole text)</option>
              </select>
            </label>
            <label>
              Text
              <textarea
                value={(data.params as NodeData<"input">["params"]).text}
                onChange={(e) => set({ text: e.target.value })}
                rows={10}
                placeholder="Paste text here…"
              />
            </label>
          </>
        )}

        {kind === "split" && (
          <>
            <label>
              Delimiter
              <input
                value={(data.params as NodeData<"split">["params"]).delimiter}
                onChange={(e) => set({ delimiter: e.target.value })}
              />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"split">["params"]).useRegex}
                onChange={(e) => set({ useRegex: e.target.checked })}
              />
              Treat delimiter as regex
            </label>
            <p className="properties__note">Each input row is split into multiple output rows.</p>
          </>
        )}

        {kind === "enclose" && (
          <>
            <label>
              Prefix
              <input
                value={(data.params as NodeData<"enclose">["params"]).prefix}
                onChange={(e) => set({ prefix: e.target.value })}
              />
            </label>
            <label>
              Suffix
              <input
                value={(data.params as NodeData<"enclose">["params"]).suffix}
                onChange={(e) => set({ suffix: e.target.value })}
              />
            </label>
            <p className="properties__note">Prefix/suffix are applied to every row individually.</p>
          </>
        )}

        {kind === "join" && (
          <>
            <label>
              Delimiter
              <input
                value={(data.params as NodeData<"join">["params"]).delimiter}
                onChange={(e) => set({ delimiter: e.target.value })}
              />
            </label>
            <p className="properties__note">All input rows are combined into a single output row.</p>
          </>
        )}

        {kind === "merge" && (
          <>
            <label>
              Join Delimiter
              <input
                value={(data.params as NodeData<"merge">["params"]).delimiter}
                onChange={(e) => set({ delimiter: e.target.value })}
              />
            </label>
            <label>
              Fallback for missing row
              <input
                value={(data.params as NodeData<"merge">["params"]).missingFallback}
                onChange={(e) => set({ missingFallback: e.target.value })}
                placeholder="(leave empty for blank)"
              />
            </label>
            <p className="properties__note">
              Connect Input A (top-left) and Input B (bottom-left). Merges corresponding rows, or repeats single-line input across all rows.
            </p>
          </>
        )}

        {kind === "append" && (
          <>
            <label>
              Append Mode
              <select
                value={(data.params as NodeData<"append">["params"]).mode}
                onChange={(e) =>
                  set({ mode: e.target.value as "newline" | "inline" })
                }
              >
                <option value="newline">Next line (appends as new rows below)</option>
                <option value="inline">At the end (appends inline to each row/line)</option>
              </select>
            </label>
            <label>
              Static Append Text (used if Input B not connected)
              <textarea
                value={(data.params as NodeData<"append">["params"]).text}
                onChange={(e) => set({ text: e.target.value })}
                rows={3}
                placeholder="Enter static text to append…"
              />
            </label>
            <p className="properties__note">
              Connect Main Input (A) and Append Data (B), or use the static text box above.
            </p>
          </>
        )}

        {kind === "trim" && (
          <label>
            Mode
            <select
              value={(data.params as NodeData<"trim">["params"]).mode}
              onChange={(e) => set({ mode: e.target.value as "both" | "start" | "end" })}
            >
              <option value="both">Both ends</option>
              <option value="start">Start only</option>
              <option value="end">End only</option>
            </select>
          </label>
        )}

        {kind === "replace" && (
          <>
            <label>
              Find
              <input
                value={(data.params as NodeData<"replace">["params"]).find}
                onChange={(e) => set({ find: e.target.value })}
              />
            </label>
            <label>
              Replace with
              <input
                value={(data.params as NodeData<"replace">["params"]).replaceWith}
                onChange={(e) => set({ replaceWith: e.target.value })}
              />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"replace">["params"]).useRegex}
                onChange={(e) => set({ useRegex: e.target.checked })}
              />
              Treat find as regex
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"replace">["params"]).all}
                onChange={(e) => set({ all: e.target.checked })}
              />
              Replace all occurrences
            </label>
          </>
        )}

        {kind === "case" && (
          <label>
            Mode
            <select
              value={(data.params as NodeData<"case">["params"]).mode}
              onChange={(e) =>
                set({ mode: e.target.value as "upper" | "lower" | "title" | "sentence" })
              }
            >
              <option value="upper">UPPER CASE</option>
              <option value="lower">lower case</option>
              <option value="title">Title Case</option>
              <option value="sentence">Sentence case</option>
            </select>
          </label>
        )}

        {kind === "filter" && (
          <>
            <label>
              Pattern
              <input
                value={(data.params as NodeData<"filter">["params"]).pattern}
                onChange={(e) => set({ pattern: e.target.value })}
              />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"filter">["params"]).useRegex}
                onChange={(e) => set({ useRegex: e.target.checked })}
              />
              Treat pattern as regex
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"filter">["params"]).invert}
                onChange={(e) => set({ invert: e.target.checked })}
              />
              Invert (exclude matches)
            </label>
          </>
        )}

        {kind === "output" && (
          <div className="properties__output-section">
            <button
              className="properties__process-btn"
              onClick={processFullGraph}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing…" : "⚡ Process Now"}
            </button>

            <div className="properties__status-card">
              {lastProcessTime !== null ? (
                <>
                  <div className="properties__status-title">Process Complete</div>
                  <div className="properties__status-meta">
                    {(fullOutputs.get(node.id) || []).length} rows processed in {lastProcessTime} ms
                  </div>
                </>
              ) : (
                <>
                  <div className="properties__status-title">Lazy Preview Mode</div>
                  <div className="properties__status-meta">
                    Click "Process Now" to execute across all rows.
                  </div>
                </>
              )}
            </div>

            <label>
              Output Filename
              <input
                value={(data.params as { filename?: string }).filename || "output.txt"}
                onChange={(e) => set({ filename: e.target.value })}
              />
            </label>

            <div className="properties__output-actions">
              <button onClick={handleCopyOutput}>Copy Output</button>
              <button onClick={handleDownloadOutput}>Download Output</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
