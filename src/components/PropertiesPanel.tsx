import { useRef, type RefObject } from "react";
import { isValidRegex } from "../engine/operations";
import { formatBytes } from "../engine/textSource";
import { useGraphStore } from "../store/useGraphStore";
import { OPERATION_DESCRIPTIONS, OPERATION_LABELS, type NodeData, type OperationParams } from "../types";
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
      <div className="properties__header">
        <h2>Properties</h2>
        <div className="properties__about">
          <span className="properties__kind-badge">{OPERATION_LABELS[kind]}</span>
          <span
            className="properties__info"
            data-tooltip={OPERATION_DESCRIPTIONS[kind]}
            aria-label={OPERATION_DESCRIPTIONS[kind]}
          >
            ?
          </span>
        </div>
      </div>
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
              <CharTokens
                value={(data.params as NodeData<"split">["params"]).delimiter}
                recognizeEscapes={!(data.params as NodeData<"split">["params"]).useRegex}
              />
              {(data.params as NodeData<"split">["params"]).useRegex && (
                <RegexWarning pattern={(data.params as NodeData<"split">["params"]).delimiter} />
              )}
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
              <CharTokens value={(data.params as NodeData<"enclose">["params"]).prefix} recognizeEscapes />
            </label>
            <label>
              Suffix
              <input
                value={(data.params as NodeData<"enclose">["params"]).suffix}
                onChange={(e) => set({ suffix: e.target.value })}
              />
              <CharTokens value={(data.params as NodeData<"enclose">["params"]).suffix} recognizeEscapes />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"enclose">["params"]).skipEmpty ?? false}
                onChange={(e) => set({ skipEmpty: e.target.checked })}
              />
              Skip empty rows
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
              <CharTokens value={(data.params as NodeData<"join">["params"]).delimiter} recognizeEscapes />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"join">["params"]).skipEmpty ?? false}
                onChange={(e) => set({ skipEmpty: e.target.checked })}
              />
              Skip empty rows before joining
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
              <CharTokens value={(data.params as NodeData<"merge">["params"]).delimiter} recognizeEscapes />
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

        {kind === "unmerge" && (
          <>
            <label>
              Delimiter
              <input
                value={(data.params as NodeData<"unmerge">["params"]).delimiter}
                onChange={(e) => set({ delimiter: e.target.value })}
                placeholder="e.g. : or ,"
              />
              <CharTokens value={(data.params as NodeData<"unmerge">["params"]).delimiter} recognizeEscapes />
            </label>
            <label>
              Split at
              <select
                value={(data.params as NodeData<"unmerge">["params"]).occurrence}
                onChange={(e) => set({ occurrence: e.target.value as "first" | "last" })}
              >
                <option value="first">First occurrence</option>
                <option value="last">Last occurrence</option>
              </select>
            </label>
            <label>
              Fallback for missing delimiter (Output B)
              <input
                value={(data.params as NodeData<"unmerge">["params"]).missingFallback}
                onChange={(e) => set({ missingFallback: e.target.value })}
                placeholder="(leave empty for blank)"
              />
            </label>
            <p className="properties__note">
              Splits each row into Output A (before delimiter) and Output B (after delimiter). Chain another Unmerge on Output B to split into 3+ columns.
            </p>
          </>
        )}

        {kind === "compare" && (
          <>
            <label>
              Set operation
              <select
                value={(data.params as NodeData<"compare">["params"]).mode}
                onChange={(e) =>
                  set({ mode: e.target.value as NodeData<"compare">["params"]["mode"] })
                }
              >
                <option value="diff">Difference (A − B: in A, not in B)</option>
                <option value="intersect">Intersection (A ∩ B: in both A and B)</option>
                <option value="xor">Symmetric difference (A Δ B: only in one)</option>
                <option value="union">Union (A ∪ B: combine A and B)</option>
              </select>
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"compare">["params"]).caseSensitive}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              Case sensitive
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"compare">["params"]).trimCompare}
                onChange={(e) => set({ trimCompare: e.target.checked })}
              />
              Ignore outer whitespace when comparing
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"compare">["params"]).unique}
                onChange={(e) => set({ unique: e.target.checked })}
              />
              Deduplicate output rows
            </label>
            <p className="properties__note">
              Connect the primary list to Input A and the comparison list to Input B.
            </p>
          </>
        )}

        {kind === "partition" && (
          <>
            <label>
              Pattern
              <input
                value={(data.params as NodeData<"partition">["params"]).pattern}
                onChange={(e) => set({ pattern: e.target.value })}
                placeholder="Text or regex to match…"
              />
              {(data.params as NodeData<"partition">["params"]).useRegex && (
                <RegexWarning pattern={(data.params as NodeData<"partition">["params"]).pattern} />
              )}
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"partition">["params"]).useRegex}
                onChange={(e) => set({ useRegex: e.target.checked })}
              />
              Treat pattern as regex
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"partition">["params"]).caseSensitive}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              Case sensitive
            </label>
            <p className="properties__note">
              Routes matching rows to <strong>Output A</strong> and non-matching rows to <strong>Output B</strong> so you can process both branches in parallel.
            </p>
          </>
        )}

        {kind === "slice" && (
          <SliceFields params={data.params as NodeData<"slice">["params"]} set={set} />
        )}

        {kind === "append" && (
          <AppendFields params={data.params as NodeData<"append">["params"]} set={set} />
        )}

        {kind === "trim" && (
          <>
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
            <label>
              Characters to trim (character set)
              <input
                value={(data.params as NodeData<"trim">["params"]).chars ?? ""}
                onChange={(e) => set({ chars: e.target.value })}
                placeholder="Default: whitespace (or e.g. {}'&quot;)"
              />
              <CharTokens
                value={(data.params as NodeData<"trim">["params"]).chars ?? ""}
                emptyLabel="␣ whitespace (default)"
              />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"trim">["params"]).collapseSpaces ?? false}
                onChange={(e) => set({ collapseSpaces: e.target.checked })}
              />
              Collapse multiple internal spaces to one
            </label>
            <p className="properties__note">
              Enter multiple symbols at once (e.g. <code>&#123;&#125; </code> or <code>&apos;&quot;-</code>) to strip any of them from{" "}
              {(data.params as NodeData<"trim">["params"]).mode === "both"
                ? "both ends in a single Trim node"
                : `the ${(data.params as NodeData<"trim">["params"]).mode}`}
              .
            </p>
          </>
        )}

        {kind === "replace" && (
          <>
            <label>
              Find
              <input
                value={(data.params as NodeData<"replace">["params"]).find}
                onChange={(e) => set({ find: e.target.value })}
              />
              <CharTokens
                value={(data.params as NodeData<"replace">["params"]).find}
                recognizeEscapes={!(data.params as NodeData<"replace">["params"]).useRegex}
              />
              {(data.params as NodeData<"replace">["params"]).useRegex && (
                <RegexWarning pattern={(data.params as NodeData<"replace">["params"]).find} />
              )}
            </label>
            <label>
              Replace with
              <input
                value={(data.params as NodeData<"replace">["params"]).replaceWith}
                onChange={(e) => set({ replaceWith: e.target.value })}
              />
              <CharTokens value={(data.params as NodeData<"replace">["params"]).replaceWith} recognizeEscapes />
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
                checked={(data.params as NodeData<"replace">["params"]).caseSensitive ?? true}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              Case sensitive
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
                set({ mode: e.target.value as NodeData<"case">["params"]["mode"] })
              }
            >
              <option value="upper">UPPER CASE</option>
              <option value="lower">lower case</option>
              <option value="title">Title Case</option>
              <option value="sentence">Sentence case</option>
              <option value="camel">camelCase</option>
              <option value="pascal">PascalCase</option>
              <option value="snake">snake_case</option>
              <option value="kebab">kebab-case</option>
              <option value="constant">CONSTANT_CASE</option>
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
              {(data.params as NodeData<"filter">["params"]).useRegex && (
                <RegexWarning pattern={(data.params as NodeData<"filter">["params"]).pattern} />
              )}
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
                checked={(data.params as NodeData<"filter">["params"]).caseSensitive ?? false}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              Case sensitive
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"filter">["params"]).invert}
                onChange={(e) => set({ invert: e.target.checked })}
              />
              Invert (exclude matches)
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"filter">["params"]).skipEmpty ?? false}
                onChange={(e) => set({ skipEmpty: e.target.checked })}
              />
              Remove empty / blank rows
            </label>
          </>
        )}

        {kind === "sort" && (
          <SortFields
            params={data.params as NodeData<"sort">["params"]}
            rowCount={(outputs.get(node.id) ?? []).length}
            set={set}
          />
        )}

        {kind === "unique" && (
          <>
            <div className="properties__segment" role="group" aria-label="Unique mode">
              <button
                type="button"
                className={(data.params as NodeData<"unique">["params"]).mode === "unique" ? "is-active" : ""}
                onClick={() => set({ mode: "unique" })}
              >
                Deduplicate
              </button>
              <button
                type="button"
                className={(data.params as NodeData<"unique">["params"]).mode === "duplicates" ? "is-active" : ""}
                onClick={() => set({ mode: "duplicates" })}
              >
                Duplicates
              </button>
              <button
                type="button"
                className={(data.params as NodeData<"unique">["params"]).mode === "singles" ? "is-active" : ""}
                onClick={() => set({ mode: "singles" })}
              >
                Singles only
              </button>
            </div>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"unique">["params"]).caseSensitive}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              Case sensitive
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"unique">["params"]).showCount}
                onChange={(e) => set({ showCount: e.target.checked })}
              />
              Prepend occurrence count
            </label>
            {(data.params as NodeData<"unique">["params"]).showCount && (
              <label>
                Count separator
                <input
                  value={(data.params as NodeData<"unique">["params"]).countPrefix}
                  onChange={(e) => set({ countPrefix: e.target.value })}
                />
                <CharTokens value={(data.params as NodeData<"unique">["params"]).countPrefix} />
              </label>
            )}
            <p className="properties__note">
              Preserves the original appearance order of rows without sorting.
            </p>
          </>
        )}

        {kind === "number" && (
          <>
            <div className="properties__segment" role="group" aria-label="Number placement">
              <button
                type="button"
                className={(data.params as NodeData<"number">["params"]).side === "start" ? "is-active" : ""}
                onClick={() => set({ side: "start" })}
              >
                Prefix (start)
              </button>
              <button
                type="button"
                className={(data.params as NodeData<"number">["params"]).side === "end" ? "is-active" : ""}
                onClick={() => set({ side: "end" })}
              >
                Suffix (end)
              </button>
            </div>
            <label>
              Start number
              <input
                type="number"
                value={(data.params as NodeData<"number">["params"]).start}
                onChange={(e) => set({ start: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
            <label>
              Step increment
              <input
                type="number"
                value={(data.params as NodeData<"number">["params"]).step}
                onChange={(e) => set({ step: parseInt(e.target.value, 10) || 1 })}
              />
            </label>
            <label>
              Zero-pad width (0 for none)
              <input
                type="number"
                min={0}
                max={12}
                value={(data.params as NodeData<"number">["params"]).padWidth}
                onChange={(e) => set({ padWidth: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              />
            </label>
            <label>
              Separator
              <input
                value={(data.params as NodeData<"number">["params"]).separator}
                onChange={(e) => set({ separator: e.target.value })}
              />
              <CharTokens value={(data.params as NodeData<"number">["params"]).separator} />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"number">["params"]).skipEmpty}
                onChange={(e) => set({ skipEmpty: e.target.checked })}
              />
              Skip empty rows
            </label>
          </>
        )}

        {kind === "extract" && (
          <ExtractFields params={data.params as NodeData<"extract">["params"]} set={set} />
        )}

        {kind === "pad" && (
          <>
            <label>
              Mode
              <select
                value={(data.params as NodeData<"pad">["params"]).mode}
                onChange={(e) =>
                  set({ mode: e.target.value as NodeData<"pad">["params"]["mode"] })
                }
              >
                <option value="padEnd">Pad end (right)</option>
                <option value="padStart">Pad start (left)</option>
                <option value="padBoth">Pad both (center)</option>
                <option value="truncate">Truncate to max width</option>
              </select>
            </label>
            <label>
              Target width (characters)
              <input
                type="number"
                min={0}
                value={(data.params as NodeData<"pad">["params"]).width}
                onChange={(e) => set({ width: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              />
            </label>
            {(data.params as NodeData<"pad">["params"]).mode === "truncate" ? (
              <label>
                Ellipsis suffix (optional)
                <input
                  value={(data.params as NodeData<"pad">["params"]).ellipsis}
                  onChange={(e) => set({ ellipsis: e.target.value })}
                  placeholder="e.g. … or ..."
                />
                <CharTokens value={(data.params as NodeData<"pad">["params"]).ellipsis} />
              </label>
            ) : (
              <label>
                Pad character
                <input
                  value={(data.params as NodeData<"pad">["params"]).padChar}
                  maxLength={1}
                  onChange={(e) => set({ padChar: e.target.value || " " })}
                />
                <CharTokens value={(data.params as NodeData<"pad">["params"]).padChar} />
              </label>
            )}
          </>
        )}

        {kind === "template" && (
          <>
            <label>
              Template pattern
              <textarea
                rows={3}
                value={(data.params as NodeData<"template">["params"]).template}
                onChange={(e) => set({ template: e.target.value })}
                placeholder="e.g. ({i}) {col1}: {col2}"
              />
            </label>
            <label>
              Column delimiter (for &#123;col1&#125;, &#123;col2&#125;…)
              <input
                value={(data.params as NodeData<"template">["params"]).delimiter}
                onChange={(e) => set({ delimiter: e.target.value })}
              />
              <CharTokens value={(data.params as NodeData<"template">["params"]).delimiter} recognizeEscapes />
            </label>
            <label className="properties__checkbox">
              <input
                type="checkbox"
                checked={(data.params as NodeData<"template">["params"]).skipEmpty}
                onChange={(e) => set({ skipEmpty: e.target.checked })}
              />
              Skip empty rows
            </label>
            <p className="properties__note">
              Placeholders: <code>&#123;row&#125;</code> (full row), <code>&#123;i&#125;</code> (1-based index), <code>&#123;i0&#125;</code> (0-based index), and <code>&#123;col1&#125;</code>, <code>&#123;col2&#125;</code>… (columns split by delimiter).
            </p>
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
          <CharTokens value={params.delimiter ?? ""} recognizeEscapes />
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

function SortFields({
  params,
  rowCount,
  set,
}: {
  params: OperationParams["sort"];
  rowCount: number;
  set: (patch: Partial<OperationParams["sort"]>) => void;
}) {
  const scope = params.scope ?? "rows";
  const direction = params.direction ?? "asc";
  const mode = params.mode ?? "natural";
  const usesDelimiter = scope === "delimited" || scope === "both";

  return (
    <>
      <div className="properties__segment" role="group" aria-label="Sort scope">
        <button
          type="button"
          className={scope === "rows" ? "is-active" : ""}
          onClick={() => set({ scope: "rows" })}
          title="Sort rows vertically"
        >
          Rows
        </button>
        <button
          type="button"
          className={scope === "delimited" ? "is-active" : ""}
          onClick={() => set({ scope: "delimited" })}
          title="Sort delimited items inside each row"
        >
          By delimiter
        </button>
        <button
          type="button"
          className={scope === "both" ? "is-active" : ""}
          onClick={() => set({ scope: "both" })}
          title="Sort delimited items inside each row, then sort all rows"
        >
          Both
        </button>
      </div>

      {usesDelimiter && (
        <>
          <label>
            In-row delimiter
            <input
              value={params.delimiter ?? ","}
              onChange={(e) => set({ delimiter: e.target.value })}
              placeholder="e.g. , or \\t"
            />
            <CharTokens value={params.delimiter ?? ","} recognizeEscapes />
          </label>
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.trimItems ?? true}
              onChange={(e) => set({ trimItems: e.target.checked })}
            />
            Trim whitespace around delimited items
          </label>
        </>
      )}

      <div className="properties__segment" role="group" aria-label="Sort direction">
        <button
          type="button"
          className={direction === "asc" ? "is-active" : ""}
          onClick={() => set({ direction: "asc" })}
        >
          Ascending (A → Z)
        </button>
        <button
          type="button"
          className={direction === "desc" ? "is-active" : ""}
          onClick={() => set({ direction: "desc" })}
        >
          Descending (Z → A)
        </button>
      </div>

      <label>
        Comparison mode
        <select
          value={mode}
          onChange={(e) =>
            set({ mode: e.target.value as OperationParams["sort"]["mode"] })
          }
        >
          <option value="natural">Natural (item2 &lt; item10)</option>
          <option value="alpha">Alphabetical (ASCII / lexicographical)</option>
          <option value="numeric">Numeric (-5 &lt; 2 &lt; 10.5)</option>
          <option value="length">Length (shortest to longest)</option>
        </select>
      </label>

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.caseSensitive ?? false}
          onChange={(e) => set({ caseSensitive: e.target.checked })}
        />
        Case sensitive
      </label>

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.unique ?? false}
          onChange={(e) => set({ unique: e.target.checked })}
        />
        Remove duplicates (unique)
      </label>

      <p className="properties__note">
        {scope === "rows" && "Sorts rows vertically by their full text."}
        {scope === "delimited" &&
          "Splits each row by the delimiter, sorts the values inside that row, and joins them back."}
        {scope === "both" &&
          "First sorts delimited values inside each row, then sorts all resulting rows vertically."}
        {scope === "rows" && rowCount === 1 && (
          <>
            {" "}
            <strong>Tip:</strong> Input has 1 row—switch to <strong>By delimiter</strong> to sort items inside a single line (e.g. <code>a,e,g,b</code> → <code>a,b,e,g</code>).
          </>
        )}
      </p>
    </>
  );
}

function CharTokens({
  value,
  recognizeEscapes = false,
  emptyLabel,
}: {
  value: string;
  recognizeEscapes?: boolean;
  emptyLabel?: string;
}) {
  if (!value) {
    if (!emptyLabel) return null;
    return (
      <div className="properties__char-tokens" aria-label="Entered characters">
        <span className="properties__char-pill properties__char-pill--empty">{emptyLabel}</span>
      </div>
    );
  }

  const tokens: Array<{ display: string; label?: string; kind: "space" | "escape" | "char" }> = [];
  for (let i = 0; i < value.length; i++) {
    if (recognizeEscapes && value[i] === "\\" && i + 1 < value.length && (value[i + 1] === "n" || value[i + 1] === "t")) {
      const next = value[i + 1];
      tokens.push({
        display: `\\${next}`,
        label: next === "n" ? "newline" : "tab",
        kind: "escape",
      });
      i++;
      continue;
    }
    const ch = value[i];
    if (ch === " ") {
      tokens.push({ display: "␣", label: "space", kind: "space" });
    } else if (ch === "\t") {
      tokens.push({ display: "⇥", label: "tab", kind: "space" });
    } else {
      tokens.push({ display: ch, kind: "char" });
    }
  }

  return (
    <div className="properties__char-tokens" aria-label="Entered characters">
      {tokens.map((token, idx) => (
        <span
          key={idx}
          className={`properties__char-pill properties__char-pill--${token.kind}`}
          title={token.label ? `Character ${idx + 1}: ${token.label}` : `Character ${idx + 1}: "${token.display}"`}
        >
          <code>{token.display}</code>
          {token.label && <span className="properties__char-pill-label">{token.label}</span>}
        </span>
      ))}
    </div>
  );
}

function SliceFields({
  params,
  set,
}: {
  params: OperationParams["slice"];
  set: (patch: Partial<OperationParams["slice"]>) => void;
}) {
  const mode = params.mode ?? "skip";
  return (
    <>
      <div className="properties__segment" role="group" aria-label="Slice mode">
        <button
          type="button"
          className={mode === "skip" ? "is-active" : ""}
          onClick={() => set({ mode: "skip" })}
        >
          Skip ends
        </button>
        <button
          type="button"
          className={mode === "range" ? "is-active" : ""}
          onClick={() => set({ mode: "range" })}
        >
          Line range
        </button>
        <button
          type="button"
          className={mode === "step" ? "is-active" : ""}
          onClick={() => set({ mode: "step" })}
        >
          Every Nth
        </button>
      </div>

      {mode === "skip" && (
        <>
          <label>
            Skip first N rows (e.g. header)
            <input
              type="number"
              min={0}
              value={params.skipStart ?? 1}
              onChange={(e) => set({ skipStart: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </label>
          <label>
            Skip last N rows (e.g. footer)
            <input
              type="number"
              min={0}
              value={params.skipEnd ?? 0}
              onChange={(e) => set({ skipEnd: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </label>
        </>
      )}

      {mode === "range" && (
        <>
          <label>
            Start line (1-based, inclusive)
            <input
              type="number"
              min={1}
              value={params.startLine ?? 1}
              onChange={(e) => set({ startLine: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </label>
          <label>
            End line (inclusive, 0 = until end)
            <input
              type="number"
              min={0}
              value={params.endLine ?? 10}
              onChange={(e) => set({ endLine: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </label>
        </>
      )}

      {mode === "step" && (
        <>
          <label>
            Take every Nth row
            <input
              type="number"
              min={1}
              value={params.step ?? 2}
              onChange={(e) => set({ step: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </label>
          <label>
            Starting at line (1-based)
            <input
              type="number"
              min={1}
              value={params.offset ?? 1}
              onChange={(e) => set({ offset: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </label>
        </>
      )}
    </>
  );
}

function ExtractFields({
  params,
  set,
}: {
  params: OperationParams["extract"];
  set: (patch: Partial<OperationParams["extract"]>) => void;
}) {
  const mode = params.mode ?? "column";
  return (
    <>
      <div className="properties__segment" role="group" aria-label="Extract mode">
        <button
          type="button"
          className={mode === "column" ? "is-active" : ""}
          onClick={() => set({ mode: "column" })}
        >
          Column
        </button>
        <button
          type="button"
          className={mode === "between" ? "is-active" : ""}
          onClick={() => set({ mode: "between" })}
        >
          Between
        </button>
        <button
          type="button"
          className={mode === "regex" ? "is-active" : ""}
          onClick={() => set({ mode: "regex" })}
        >
          Regex
        </button>
      </div>

      {mode === "column" && (
        <>
          <label>
            Delimiter
            <input
              value={params.delimiter ?? ","}
              onChange={(e) => set({ delimiter: e.target.value })}
            />
            <CharTokens value={params.delimiter ?? ","} recognizeEscapes />
          </label>
          <label>
            Column number (1 = first, -1 = last)
            <input
              type="number"
              value={params.column ?? 1}
              onChange={(e) => set({ column: parseInt(e.target.value, 10) || 1 })}
            />
          </label>
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.trimValues ?? true}
              onChange={(e) => set({ trimValues: e.target.checked })}
            />
            Trim extracted column value
          </label>
        </>
      )}

      {mode === "between" && (
        <>
          <label>
            Start delimiter
            <input
              value={params.startDelim ?? "["}
              onChange={(e) => set({ startDelim: e.target.value })}
            />
            <CharTokens value={params.startDelim ?? "["} recognizeEscapes />
          </label>
          <label>
            End delimiter
            <input
              value={params.endDelim ?? "]"}
              onChange={(e) => set({ endDelim: e.target.value })}
            />
            <CharTokens value={params.endDelim ?? "]"} recognizeEscapes />
          </label>
        </>
      )}

      {mode === "regex" && (
        <>
          <label>
            Regular expression
            <input
              value={params.pattern ?? ""}
              onChange={(e) => set({ pattern: e.target.value })}
              placeholder="e.g. id=(\d+)"
            />
            <RegexWarning pattern={params.pattern ?? ""} />
          </label>
          <label>
            Capture group (0 = full match, 1 = first group)
            <input
              type="number"
              min={0}
              value={params.group ?? 1}
              onChange={(e) => set({ group: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </label>
        </>
      )}

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.dropUnmatched ?? false}
          onChange={(e) => set({ dropUnmatched: e.target.checked })}
        />
        Drop rows without a match
      </label>

      {!(params.dropUnmatched ?? false) && (
        <label>
          Fallback when not found
          <input
            value={params.missingFallback ?? ""}
            onChange={(e) => set({ missingFallback: e.target.value })}
            placeholder="(leave empty for blank)"
          />
        </label>
      )}
    </>
  );
}

function RegexWarning({ pattern }: { pattern: string }) {
  if (!pattern || isValidRegex(pattern)) return null;
  return (
    <span className="properties__regex-warning" role="alert">
      Invalid regular expression — falling back to literal match
    </span>
  );
}
