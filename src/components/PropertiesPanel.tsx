import { useRef, type RefObject } from "react";
import { formatBytes } from "../engine/textSource";
import { useGraphStore } from "../store/useGraphStore";
import type { NodeData, OperationParams } from "../types";
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
  const attachInputFile = useGraphStore((s) => s.attachInputFile);
  const clearInputFile = useGraphStore((s) => s.clearInputFile);
  const isReadingFile = useGraphStore((s) => s.isReadingFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const selectedCount = nodes.filter((n) => n.selected).length;

  if (!node) {
    return (
      <section className="properties">
        <h2>Properties</h2>
        <p className="properties__hint">
          Select a node to edit its settings. Ctrl-click or drag across nodes to select several, then Ctrl+C and Ctrl+V to copy them.
        </p>
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
      {selectedCount > 1 && (
        <p className="properties__hint">{selectedCount} nodes selected. Editing the last one. Ctrl+C / Ctrl+V copies the selection.</p>
      )}
      <label className="properties__name">
        Name
        <input value={data.label} onChange={(e) => renameNode(node.id, e.target.value)} />
      </label>
      <div className="properties__body">
        {kind === "input" && (
          <InputFields
            nodeId={node.id}
            params={data.params as NodeData<"input">["params"]}
            isReadingFile={isReadingFile}
            fileInputRef={fileInputRef}
            set={set}
            attachInputFile={attachInputFile}
            clearInputFile={clearInputFile}
          />
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
          <AppendFields params={data.params as NodeData<"append">["params"]} set={set} />
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
function InputFields({
  nodeId,
  params,
  isReadingFile,
  fileInputRef,
  set,
  attachInputFile,
  clearInputFile,
}: {
  nodeId: string;
  params: OperationParams["input"];
  isReadingFile: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  set: (patch: Partial<OperationParams["input"]>) => void;
  attachInputFile: (id: string, file: File) => void;
  clearInputFile: (id: string) => void;
}) {
  const source = params.source ?? "text";
  const inputType = params.inputType ?? "lines";
  return (
    <>
      <div className="properties__segment" role="group" aria-label="Input source">
        <button type="button" className={source === "text" ? "is-active" : ""} onClick={() => set({ source: "text" })}>
          Paste
        </button>
        <button type="button" className={source === "file" ? "is-active" : ""} onClick={() => set({ source: "file" })}>
          File
        </button>
      </div>
      <div className="properties__segment" role="group" aria-label="Split mode">
        <button type="button" className={inputType === "lines" ? "is-active" : ""} onClick={() => set({ inputType: "lines" })}>
          Newline
        </button>
        <button type="button" className={inputType === "custom" ? "is-active" : ""} onClick={() => set({ inputType: "custom" })}>
          Custom
        </button>
        <button type="button" className={inputType === "single" ? "is-active" : ""} onClick={() => set({ inputType: "single" })}>
          Whole
        </button>
      </div>
      {inputType === "custom" && (
        <label>
          Custom split
          <input
            value={params.delimiter ?? ""}
            onChange={(e) => set({ delimiter: e.target.value })}
            placeholder="e.g. ,  or \\n"
          />
        </label>
      )}
      {source === "file" ? (
        <div className="properties__file">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) attachInputFile(nodeId, file);
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Load CSV or TXT
          </button>
          <span className="properties__file-name">
            {params.fileName ? `${params.fileName} · ${formatBytes(params.fileSize)}` : "No file loaded"}
          </span>
          {params.fileName && (
            <button type="button" className="properties__file-clear" onClick={() => clearInputFile(nodeId)}>
              Use pasted text instead
            </button>
          )}
          <p className="properties__note">
            {isReadingFile
              ? "Reading a preview slice…"
              : "Preview reads only the limited rows, not the whole file. Process Now reads the full file."}
          </p>
        </div>
      ) : (
        <label>
          Text
          <textarea
            value={params.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            rows={10}
            placeholder="Paste text here…"
          />
        </label>
      )}
    </>
  );
}

function AppendFields({
  params,
  set,
}: {
  params: OperationParams["append"];
  set: (patch: Partial<OperationParams["append"]>) => void;
}) {
  const scope = params.scope ?? "insert";
  const side = params.side ?? "end";
  return (
    <>
      <div className="properties__segment" role="group" aria-label="Append scope">
        <button type="button" className={scope === "all" ? "is-active" : ""} onClick={() => set({ scope: "all" })}>
          Every row
        </button>
        <button type="button" className={scope === "row" ? "is-active" : ""} onClick={() => set({ scope: "row", line: params.line || 1 })}>
          One row
        </button>
        <button type="button" className={scope === "insert" ? "is-active" : ""} onClick={() => set({ scope: "insert" })}>
          New rows
        </button>
      </div>
      <div className="properties__segment" role="group" aria-label="Append side">
        <button type="button" className={side === "start" ? "is-active" : ""} onClick={() => set({ side: "start" })}>
          Start
        </button>
        <button type="button" className={side === "end" ? "is-active" : ""} onClick={() => set({ side: "end" })}>
          End
        </button>
      </div>
      {scope !== "all" && (
        <label>
          Line
          <input
            type="number"
            min={scope === "insert" ? 0 : 1}
            value={params.line ?? 0}
            onChange={(e) => set({ line: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          />
        </label>
      )}
      <label>
        Static text (used if Input B is not connected)
        <textarea
          value={params.text ?? ""}
          onChange={(e) => set({ text: e.target.value })}
          rows={3}
          placeholder="Text to append…"
        />
      </label>
      <p className="properties__note">
        {scope === "all" && side === "start" && "Adds the text to the start of every row."}
        {scope === "all" && side === "end" && "Adds the text to the end of every row."}
        {scope === "row" && `Adds the text to the ${side} of line ${params.line || 1} only.`}
        {scope === "insert" && side === "end" && (params.line > 0 ? `Inserts new rows after line ${params.line}.` : "Inserts new rows after the last line.")}
        {scope === "insert" && side === "start" && (params.line > 1 ? `Inserts new rows before line ${params.line}.` : "Inserts new rows at the start.")}
        {" "}Input B overrides the static text.
      </p>
    </>
  );
}