import { useRef, useState, type RefObject } from "react";
import { isValidRegex, parseColumnSpec, parseCsvColumns } from "../engine/operations";
import { formatBytes } from "../engine/textSource";
import { saveTextFile } from "../store/projectPersistence";
import { useGraphStore } from "../store/useGraphStore";
import {
  ALL_STAT_METRICS,
  NUMERIC_STAT_METRICS,
  OPERATION_DESCRIPTIONS,
  OPERATION_LABELS,
  resolveStatMetrics,
  STAT_METRIC_LABELS,
  TEXT_STAT_METRICS,
  type NodeData,
  type OperationParams,
  type StatMetricKey,
} from "../types";
import "./PropertiesPanel.css";

export function PropertiesPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const outputs = useGraphStore((s) => s.outputs);
  const fullOutputs = useGraphStore((s) => s.fullOutputs);
  const isProcessing = useGraphStore((s) => s.isProcessing);
  const lastProcessTime = useGraphStore((s) => s.lastProcessTime);
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams);
  const renameNode = useGraphStore((s) => s.renameNode);
  const setNodeNote = useGraphStore((s) => s.setNodeNote);
  const toggleNodeBypass = useGraphStore((s) => s.toggleNodeBypass);
  const fanOutColumns = useGraphStore((s) => s.fanOutColumns);
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
  const incomingEdge = edges.find((e) => e.target === node.id);
  const upstreamKey = incomingEdge
    ? incomingEdge.sourceHandle === "a" || incomingEdge.sourceHandle === "b"
      ? `${incomingEdge.source}:${incomingEdge.sourceHandle}`
      : incomingEdge.source
    : null;
  const upstreamRows = upstreamKey
    ? (outputs.get(upstreamKey) ?? outputs.get(incomingEdge!.source) ?? [])
    : [];

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
    void saveTextFile(rows.join("\n"), filename);
  }

  return (
    <section className="properties">
      <div className="properties__header">
        <h2>Properties</h2>
        <div className="properties__about">
          {kind !== "input" && kind !== "output" && (
            <button
              type="button"
              className={`properties__bypass-btn ${data.bypassed ? "is-bypassed" : ""}`}
              onClick={() => toggleNodeBypass(node.id)}
              title={
                data.bypassed
                  ? "Node is bypassed (muted) — click to re-enable"
                  : "Bypass node so input passes straight through"
              }
            >
              {data.bypassed ? "⊘ Bypassed" : "⚡ Bypass"}
            </button>
          )}
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
      <div className="properties__identity">
        <label className="properties__name">
          Name
          <input value={data.label} onChange={(e) => renameNode(node.id, e.target.value)} />
        </label>
        <label className="properties__note-field">
          Subtitle / Note
          <input
            value={data.note ?? ""}
            onChange={(e) => setNodeNote(node.id, e.target.value)}
            placeholder="Optional note shown on canvas…"
          />
        </label>
      </div>
      {data.bypassed && kind !== "input" && kind !== "output" && (
        <div className="properties__bypass-banner" role="status">
          This node is <strong>bypassed</strong>. Incoming data passes straight through untouched.
        </div>
      )}
      <div className="properties__body">
        {kind === "input" && (
          <InputFields
            nodeId={node.id}
            params={data.params as NodeData<"input">["params"]}
            rows={outputs.get(node.id) ?? []}
            isReadingFile={isReadingFile}
            fileInputRef={fileInputRef}
            set={set}
            attachInputFile={attachInputFile}
            clearInputFile={clearInputFile}
            fanOutColumns={fanOutColumns}
          />
        )}

        {kind === "split" && (
          <>
            <label>
              <span className="properties__label-row">
                <span>Delimiter</span>
                <RegexPresets
                  onSelect={(pattern) => set({ delimiter: pattern, useRegex: true })}
                />
              </span>
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
            {!(data.params as NodeData<"split">["params"]).useRegex && (
              <label className="properties__checkbox">
                <input
                  type="checkbox"
                  checked={(data.params as NodeData<"split">["params"]).quoteAware ?? false}
                  onChange={(e) => set({ quoteAware: e.target.checked })}
                />
                Quote-aware CSV mode (ignore delimiters inside quotes)
              </label>
            )}
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
            <div className="properties__field-group">
              <span className="properties__group-label">Join mode</span>
              <div className="properties__segment" role="group" aria-label="Join mode">
                <button
                  type="button"
                  className={((data.params as NodeData<"join">["params"]).mode ?? "all") === "all" ? "is-active" : ""}
                  onClick={() => set({ mode: "all" })}
                  title="Combine all incoming rows into one single row"
                >
                  All rows (1 line)
                </button>
                <button
                  type="button"
                  className={(data.params as NodeData<"join">["params"]).mode === "chunk" ? "is-active" : ""}
                  onClick={() =>
                    set({
                      mode: "chunk",
                      chunkSize: (data.params as NodeData<"join">["params"]).chunkSize ?? 2,
                    })
                  }
                  title="Group every N consecutive rows together while keeping multiple output rows"
                >
                  Every N rows
                </button>
              </div>
            </div>
            {(data.params as NodeData<"join">["params"]).mode === "chunk" && (
              <label>
                Rows per group (N)
                <input
                  type="number"
                  min={1}
                  value={(data.params as NodeData<"join">["params"]).chunkSize ?? 2}
                  onChange={(e) => set({ chunkSize: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                />
              </label>
            )}
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
            <p className="properties__note">
              {(data.params as NodeData<"join">["params"]).mode === "chunk"
                ? `Combines every ${(data.params as NodeData<"join">["params"]).chunkSize ?? 2} consecutive rows into 1 row, keeping the output as multiple rows.`
                : "All input rows are combined into a single output row."}
            </p>
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
              <span className="properties__label-row">
                <span>Pattern</span>
                <RegexPresets
                  onSelect={(pattern) => set({ pattern, useRegex: true })}
                />
              </span>
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
              <span className="properties__label-row">
                <span>Find</span>
                <RegexPresets
                  onSelect={(pattern) => set({ find: pattern, useRegex: true })}
                />
              </span>
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
              <span className="properties__label-row">
                <span>Pattern</span>
                <RegexPresets
                  onSelect={(pattern) => set({ pattern, useRegex: true })}
                />
              </span>
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
          <ExtractFields
            params={data.params as NodeData<"extract">["params"]}
            upstreamRows={upstreamRows}
            upstreamSourceId={incomingEdge?.source ?? null}
            fanOutColumns={fanOutColumns}
            set={set}
          />
        )}

        {kind === "columns" && (
          <ColumnsFields
            params={data.params as NodeData<"columns">["params"]}
            upstreamRows={upstreamRows}
            set={set}
          />
        )}

        {kind === "json" && (
          <JsonFields
            params={data.params as NodeData<"json">["params"]}
            upstreamRows={upstreamRows}
            set={set}
          />
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
                  placeholder="Default: space (or e.g. 0, ., -)"
                  onChange={(e) => set({ padChar: e.target.value.slice(-1) })}
                />
                <CharTokens
                  value={(data.params as NodeData<"pad">["params"]).padChar}
                  emptyLabel="␣ space (default)"
                />
              </label>
            )}
          </>
        )}

        {kind === "template" && (
          <TemplateFields
            params={data.params as NodeData<"template">["params"]}
            upstreamRows={upstreamRows}
            set={set}
          />
        )}

        {kind === "encode" && (
          <>
            <div className="properties__segment" role="group" aria-label="Encode or decode direction">
              <button
                type="button"
                className={(data.params as NodeData<"encode">["params"]).direction === "encode" ? "is-active" : ""}
                onClick={() => set({ direction: "encode" })}
              >
                Encode
              </button>
              <button
                type="button"
                className={(data.params as NodeData<"encode">["params"]).direction === "decode" ? "is-active" : ""}
                onClick={() => set({ direction: "decode" })}
              >
                Decode
              </button>
            </div>
            <label>
              Format
              <select
                value={(data.params as NodeData<"encode">["params"]).format}
                onChange={(e) =>
                  set({ format: e.target.value as NodeData<"encode">["params"]["format"] })
                }
              >
                <option value="base64">Base64 (UTF-8)</option>
                <option value="url">URL Component (%20)</option>
                <option value="html">HTML Entities (&amp;amp;, &amp;lt;…)</option>
                <option value="json">JSON String Escape (\n, \&quot;…)</option>
                <option value="hex">Hexadecimal (UTF-8 bytes)</option>
              </select>
            </label>
            <p className="properties__note">
              Transforms each row individually. Invalid encoded strings during Decode pass through unchanged.
            </p>
          </>
        )}

        {kind === "stats" && (
          <StatsFields params={data.params as NodeData<"stats">["params"]} set={set} />
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
  rows,
  isReadingFile,
  fileInputRef,
  set,
  attachInputFile,
  clearInputFile,
  fanOutColumns,
}: {
  nodeId: string;
  params: OperationParams["input"];
  rows: string[];
  isReadingFile: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  set: (patch: Partial<OperationParams["input"]>) => void;
  attachInputFile: (id: string, file: File) => void;
  clearInputFile: (id: string) => void;
  fanOutColumns: (
    sourceNodeId: string,
    delimiter?: string,
    quoteAware?: boolean,
    skipHeader?: boolean,
    selectedColumns?: number[]
  ) => string[];
}) {
  const [csvToolsOpen, setCsvToolsOpen] = useState(false);
  const [fanOutDelimiter, setFanOutDelimiter] = useState(",");
  const [fanOutQuoteAware, setFanOutQuoteAware] = useState(true);
  const [fanOutSkipHeader, setFanOutSkipHeader] = useState(true);
  const [excludedCols, setExcludedCols] = useState<number[]>([]);
  const source = params.source ?? "text";
  const inputType = params.inputType ?? "lines";
  const firstRow = rows.find((r) => r.trim().length > 0) ?? "";
  const detectedCsvCols =
    inputType === "lines" && firstRow
      ? parseCsvColumns(firstRow, fanOutDelimiter, fanOutQuoteAware).slice(0, 12)
      : [];
  const excludedSet = new Set(excludedCols);
  const selectedColNums = detectedCsvCols
    .map((_, idx) => idx + 1)
    .filter((colNum) => !excludedSet.has(colNum));

  function toggleFanOutCol(colNum: number) {
    setExcludedCols((prev) =>
      prev.includes(colNum) ? prev.filter((c) => c !== colNum) : [...prev, colNum]
    );
  }

  return (
    <>
      <div className="properties__field-group">
        <span className="properties__group-label">Data source</span>
        <div className="properties__segment" role="group" aria-label="Input source">
          <button
            type="button"
            className={source === "text" ? "is-active" : ""}
            onClick={() => set({ source: "text" })}
            title="Type or paste text directly into the editor below"
          >
            Paste
          </button>
          <button
            type="button"
            className={source === "file" ? "is-active" : ""}
            onClick={() => set({ source: "file" })}
            title="Load a local .txt or .csv file from your device (processed 100% in browser)"
          >
            File
          </button>
        </div>
      </div>

      <div className="properties__field-group">
        <span className="properties__group-label">How to split input into rows</span>
        <div className="properties__segment" role="group" aria-label="Split mode">
          <button
            type="button"
            className={inputType === "lines" ? "is-active" : ""}
            onClick={() => set({ inputType: "lines" })}
            title="Split at each line break (\n) — every line becomes one row"
          >
            Newline
          </button>
          <button
            type="button"
            className={inputType === "custom" ? "is-active" : ""}
            onClick={() => set({ inputType: "custom" })}
            title="Split into rows using a custom delimiter (e.g. comma, pipe |, or tab \t)"
          >
            Custom
          </button>
          <button
            type="button"
            className={inputType === "single" ? "is-active" : ""}
            onClick={() => set({ inputType: "single" })}
            title="Do not split — keep the entire input text as one single row"
          >
            Whole
          </button>
        </div>
        <p className="properties__note">
          {inputType === "lines" && (
            <>
              <strong>Newline:</strong> Each line break starts a new row (best for lists, logs, and CSV records).
            </>
          )}
          {inputType === "custom" && (
            <>
              <strong>Custom:</strong> Splits the text into separate rows wherever your custom delimiter appears.
            </>
          )}
          {inputType === "single" && (
            <>
              <strong>Whole:</strong> Keeps the entire input together as <strong>1 single value</strong> without splitting on line breaks.
            </>
          )}
        </p>
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
      {inputType === "lines" && firstRow.length > 0 && (
        <div className="properties__csv-box">
          <button
            type="button"
            className="properties__stats-toggle"
            aria-expanded={csvToolsOpen}
            onClick={() => setCsvToolsOpen((open) => !open)}
          >
            <span>Column Fan-Out (Optional)</span>
            <span className="properties__stats-meta">
              <span className="properties__stats-count">
                {detectedCsvCols.length >= 2 ? `${detectedCsvCols.length} cols` : "1 col"}
              </span>
              <span className="properties__stats-chevron" aria-hidden="true">
                {csvToolsOpen ? "▾" : "▸"}
              </span>
            </span>
          </button>
          {csvToolsOpen && (
            <>
              <p className="properties__note">
                By default, each line stays a single row (1 column). Use this helper to spawn separate <strong>Extract</strong> nodes for each column.
              </p>
              <label>
                Column delimiter (supports \t)
                <input
                  value={fanOutDelimiter}
                  onChange={(e) => setFanOutDelimiter(e.target.value)}
                  placeholder="e.g. , or ; or | or \t"
                />
                <CharTokens value={fanOutDelimiter} recognizeEscapes />
              </label>
              {detectedCsvCols.length >= 2 ? (
                <>
                  <div className="properties__col-checklist-header">
                    <span className="properties__csv-columns-title">
                      Click columns to include ({selectedColNums.length}/{detectedCsvCols.length}):
                    </span>
                    <div className="properties__col-quick-btns">
                      <button
                        type="button"
                        className="properties__col-quick-btn"
                        onClick={() => setExcludedCols([])}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="properties__col-quick-btn"
                        onClick={() =>
                          setExcludedCols(detectedCsvCols.map((_, idx) => idx + 1))
                        }
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="properties__col-pills">
                    {detectedCsvCols.map((col, idx) => {
                      const colNum = idx + 1;
                      const isSelected = !excludedSet.has(colNum);
                      return (
                        <button
                          key={colNum}
                          type="button"
                          className={`properties__col-pill ${isSelected ? "is-active" : ""}`}
                          onClick={() => toggleFanOutCol(colNum)}
                          aria-pressed={isSelected}
                          title={`Click to ${isSelected ? "exclude" : "include"} Column ${colNum}: ${col || "(empty)"}`}
                        >
                          <span>{isSelected ? "✓" : "○"}</span>
                          <strong>{colNum}:</strong> {col || <em>empty</em>}
                        </button>
                      );
                    })}
                  </div>
                  <label className="properties__checkbox">
                    <input
                      type="checkbox"
                      checked={fanOutQuoteAware}
                      onChange={(e) => setFanOutQuoteAware(e.target.checked)}
                    />
                    Quote-aware CSV mode (ignore delimiters inside quotes)
                  </label>
                  <label className="properties__checkbox">
                    <input
                      type="checkbox"
                      checked={fanOutSkipHeader}
                      onChange={(e) => setFanOutSkipHeader(e.target.checked)}
                    />
                    Skip 1st row (header) on spawned nodes
                  </label>
                  <button
                    type="button"
                    className="properties__fanout-btn"
                    disabled={selectedColNums.length === 0}
                    onClick={() =>
                      fanOutColumns(
                        nodeId,
                        fanOutDelimiter,
                        fanOutQuoteAware,
                        fanOutSkipHeader && rows.length > 1,
                        selectedColNums
                      )
                    }
                    title="Automatically create and connect an Extract node for each selected column"
                  >
                    {selectedColNums.length === 0
                      ? "Select at least 1 column to fan out"
                      : selectedColNums.length === detectedCsvCols.length
                        ? `⑃ Fan Out All ${detectedCsvCols.length} Column Extract Nodes`
                        : `⑃ Fan Out ${selectedColNums.length} Selected Column(s)`}
                  </button>
                </>
              ) : (
                <p className="properties__note">
                  Only 1 column detected in row 1 with delimiter <code>{fanOutDelimiter || "(empty)"}</code>. Enter another delimiter (such as <code>,</code>, <code>;</code>, <code>|</code>, or <code>\t</code>) if your rows have multiple columns.
                </p>
              )}
            </>
          )}
        </div>
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
  upstreamRows,
  upstreamSourceId,
  fanOutColumns,
  set,
}: {
  params: OperationParams["extract"];
  upstreamRows: string[];
  upstreamSourceId: string | null;
  fanOutColumns: (
    sourceNodeId: string,
    delimiter?: string,
    quoteAware?: boolean,
    skipHeader?: boolean
  ) => string[];
  set: (patch: Partial<OperationParams["extract"]>) => void;
}) {
  const mode = params.mode ?? "column";
  const firstRow = upstreamRows.find((r) => r.trim().length > 0) ?? "";
  const detectedCols =
    mode === "column" && firstRow
      ? parseCsvColumns(firstRow, params.delimiter ?? ",", params.quoteAware ?? true).slice(0, 12)
      : [];

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
          {detectedCols.length >= 2 && (
            <div className="properties__csv-box">
              <div className="properties__csv-header">
                <span>Detected columns (click to select)</span>
              </div>
              <div className="properties__col-pills">
                {detectedCols.map((col, idx) => {
                  const colNum = idx + 1;
                  const active = (params.column ?? 1) === colNum;
                  return (
                    <button
                      key={colNum}
                      type="button"
                      className={`properties__col-pill ${active ? "is-active" : ""}`}
                      onClick={() => set({ column: colNum })}
                      title={`Select column ${colNum}: ${col || "(empty)"}`}
                    >
                      <strong>{colNum}:</strong> {col || <em>empty</em>}
                    </button>
                  );
                })}
              </div>
              {upstreamSourceId && (
                <button
                  type="button"
                  className="properties__fanout-btn"
                  onClick={() =>
                    fanOutColumns(
                      upstreamSourceId,
                      params.delimiter ?? ",",
                      params.quoteAware ?? true,
                      params.skipHeader ?? upstreamRows.length > 1
                    )
                  }
                  title="Spawn an Extract node for every detected column from the upstream source"
                >
                  ⑃ Fan Out All {detectedCols.length} Columns
                </button>
              )}
            </div>
          )}
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.skipHeader ?? false}
              onChange={(e) => set({ skipHeader: e.target.checked })}
            />
            Skip 1st row (CSV header)
          </label>
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.trimValues ?? true}
              onChange={(e) => set({ trimValues: e.target.checked })}
            />
            Trim extracted column value
          </label>
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.quoteAware ?? true}
              onChange={(e) => set({ quoteAware: e.target.checked })}
            />
            Quote-aware CSV mode (ignore delimiters inside quotes)
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
            <span className="properties__label-row">
              <span>Regular expression</span>
              <RegexPresets onSelect={(pattern) => set({ pattern })} />
            </span>
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

function TemplateFields({
  params,
  upstreamRows,
  set,
}: {
  params: OperationParams["template"];
  upstreamRows: string[];
  set: (patch: Partial<OperationParams["template"]>) => void;
}) {
  const firstRow = upstreamRows.find((r) => r.trim().length > 0) ?? "";
  const detectedCols = firstRow
    ? parseCsvColumns(firstRow, params.delimiter ?? ",", params.quoteAware ?? true).slice(0, 12)
    : [];

  return (
    <>
      <label>
        Template pattern
        <textarea
          rows={3}
          value={params.template}
          onChange={(e) => set({ template: e.target.value })}
          placeholder="e.g. ({i}) {col1}: {col2}"
        />
      </label>
      <label>
        Column delimiter (for &#123;col1&#125;, &#123;col2&#125;…)
        <input
          value={params.delimiter}
          onChange={(e) => set({ delimiter: e.target.value })}
        />
        <CharTokens value={params.delimiter} recognizeEscapes />
      </label>
      {detectedCols.length >= 2 && (
        <div className="properties__csv-box">
          <div className="properties__csv-header">
            <span>Detected columns (click to insert placeholder)</span>
          </div>
          <div className="properties__col-pills">
            {detectedCols.map((col, idx) => {
              const token = `{col${idx + 1}}`;
              return (
                <button
                  key={token}
                  type="button"
                  className="properties__col-pill"
                  onClick={() => set({ template: `${params.template}${token}` })}
                  title={`Append ${token} (${col || "empty"}) to template`}
                >
                  <strong>{token}:</strong> {col || <em>empty</em>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.skipHeader ?? false}
          onChange={(e) => set({ skipHeader: e.target.checked })}
        />
        Skip 1st row (CSV header)
      </label>
      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.quoteAware ?? true}
          onChange={(e) => set({ quoteAware: e.target.checked })}
        />
        Quote-aware CSV mode (ignore delimiters inside quotes)
      </label>
      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.skipEmpty}
          onChange={(e) => set({ skipEmpty: e.target.checked })}
        />
        Skip empty rows
      </label>
      <p className="properties__note">
        Placeholders: <code>&#123;row&#125;</code> (full row), <code>&#123;i&#125;</code> (1-based index), <code>&#123;i0&#125;</code> (0-based index), and <code>&#123;col1&#125;</code>, <code>&#123;col2&#125;</code>… (columns split by delimiter).
      </p>
    </>
  );
}

function StatsFields({
  params,
  set,
}: {
  params: OperationParams["stats"];
  set: (patch: Partial<OperationParams["stats"]>) => void;
}) {
  const [textGroupOpen, setTextGroupOpen] = useState(false);
  const [numericGroupOpen, setNumericGroupOpen] = useState(false);
  const selectedList = resolveStatMetrics(params);
  const selectedSet = new Set<StatMetricKey>(selectedList);
  const includeLabels = params.includeLabels ?? true;
  const hasUniqueOrDup = selectedSet.has("uniqueRows") || selectedSet.has("duplicateRows");

  const isFrequency = params.mode === "frequency";
  const isAll = !isFrequency && selectedSet.size === ALL_STAT_METRICS.length;
  const isTextOnly =
    !isFrequency &&
    selectedSet.size === TEXT_STAT_METRICS.length &&
    TEXT_STAT_METRICS.every((k) => selectedSet.has(k));
  const isNumericOnly =
    !isFrequency &&
    selectedSet.size === NUMERIC_STAT_METRICS.length &&
    NUMERIC_STAT_METRICS.every((k) => selectedSet.has(k));
  const activePreset = isFrequency
    ? "frequency"
    : isAll
      ? "all"
      : isTextOnly
        ? "text"
        : isNumericOnly
          ? "numeric"
          : "custom";

  function applyMetrics(next: StatMetricKey[]) {
    const nextSet = new Set(next);
    const ordered = ALL_STAT_METRICS.filter((k) => nextSet.has(k));
    const nextMode =
      ordered.length === ALL_STAT_METRICS.length
        ? "all"
        : ordered.length === TEXT_STAT_METRICS.length && TEXT_STAT_METRICS.every((k) => nextSet.has(k))
          ? "text"
          : ordered.length === NUMERIC_STAT_METRICS.length && NUMERIC_STAT_METRICS.every((k) => nextSet.has(k))
            ? "numeric"
            : "custom";
    set({ mode: nextMode, metrics: ordered });
  }

  function toggleMetric(key: StatMetricKey) {
    if (selectedSet.has(key)) {
      applyMetrics(selectedList.filter((k) => k !== key));
    } else {
      applyMetrics([...selectedList, key]);
    }
  }

  return (
    <>
      <div className="properties__segment" role="group" aria-label="Statistics preset">
        <button
          type="button"
          className={activePreset === "all" ? "is-active" : ""}
          onClick={() => set({ mode: "all", metrics: [...ALL_STAT_METRICS] })}
          title="Select all 17 Text & Rows + Numeric metrics"
        >
          All (17)
        </button>
        <button
          type="button"
          className={activePreset === "text" ? "is-active" : ""}
          onClick={() => set({ mode: "text", metrics: [...TEXT_STAT_METRICS] })}
          title="Select the 11 row, word, character, and length metrics"
        >
          Text &amp; Rows
        </button>
        <button
          type="button"
          className={activePreset === "numeric" ? "is-active" : ""}
          onClick={() => set({ mode: "numeric", metrics: [...NUMERIC_STAT_METRICS] })}
          title="Select the 6 numeric math aggregations"
        >
          Numeric
        </button>
        <button
          type="button"
          className={activePreset === "frequency" ? "is-active" : ""}
          onClick={() => set({ mode: "frequency" })}
          title="Output a sorted frequency table of distinct rows with counts and percentages"
        >
          Freq
        </button>
        <button
          type="button"
          className={!isFrequency && selectedSet.size === 0 ? "is-active" : ""}
          onClick={() => {
            set({ mode: "custom", metrics: [] });
            setTextGroupOpen(true);
            setNumericGroupOpen(true);
          }}
          title="Uncheck all metrics so you can pick only the ones you want"
        >
          Clear
        </button>
      </div>

      <p className="properties__note">
        {activePreset === "all" && (
          <>
            <strong>All (Text + Numeric):</strong> Outputs all 11 <strong>Text &amp; Rows</strong> counts/lengths plus all 6 <strong>Numeric</strong> math aggregations.
          </>
        )}
        {activePreset === "text" && (
          <>
            <strong>Text &amp; Rows only:</strong> Outputs row counts, word/character totals, and min/max/avg character length—without numeric math rows.
          </>
        )}
        {activePreset === "numeric" && (
          <>
            <strong>Numeric only:</strong> Parses numbers from rows and outputs math aggregations only (<code>Numeric values</code>, <code>Sum</code>, <code>Average</code>, <code>Median</code>, <code>Min</code>, <code>Max</code>).
          </>
        )}
        {activePreset === "frequency" && (
          <>
            <strong>Frequency Table:</strong> Counts how many times each distinct row appears and outputs them sorted from most frequent to least frequent with percentages (e.g. <code>apple: 3 (50%)</code>).
          </>
        )}
        {activePreset === "custom" && (
          <>
            <strong>Custom selection ({selectedSet.size} of {ALL_STAT_METRICS.length}):</strong> Only the checked statistics below are included in the output.
          </>
        )}
      </p>

      {!isFrequency && (
        <>
          <div className="properties__stats-group">
            <button
              type="button"
              className="properties__stats-toggle"
              aria-expanded={textGroupOpen}
              onClick={() => setTextGroupOpen((open) => !open)}
            >
              <span>Text &amp; Row Metrics</span>
              <span className="properties__stats-meta">
                <span className="properties__stats-count">
                  {TEXT_STAT_METRICS.filter((k) => selectedSet.has(k)).length}/{TEXT_STAT_METRICS.length}
                </span>
                <span className="properties__stats-chevron" aria-hidden="true">
                  {textGroupOpen ? "▾" : "▸"}
                </span>
              </span>
            </button>
            {textGroupOpen && (
              <div className="properties__stats-grid">
                {TEXT_STAT_METRICS.map((key) => (
                  <label key={key} className="properties__checkbox properties__stats-item">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(key)}
                      onChange={() => toggleMetric(key)}
                    />
                    <span>{STAT_METRIC_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="properties__stats-group">
            <button
              type="button"
              className="properties__stats-toggle"
              aria-expanded={numericGroupOpen}
              onClick={() => setNumericGroupOpen((open) => !open)}
            >
              <span>Numeric Metrics</span>
              <span className="properties__stats-meta">
                <span className="properties__stats-count">
                  {NUMERIC_STAT_METRICS.filter((k) => selectedSet.has(k)).length}/{NUMERIC_STAT_METRICS.length}
                </span>
                <span className="properties__stats-chevron" aria-hidden="true">
                  {numericGroupOpen ? "▾" : "▸"}
                </span>
              </span>
            </button>
            {numericGroupOpen && (
              <div className="properties__stats-grid">
                {NUMERIC_STAT_METRICS.map((key) => (
                  <label key={key} className="properties__checkbox properties__stats-item">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(key)}
                      onChange={() => toggleMetric(key)}
                    />
                    <span>{STAT_METRIC_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={includeLabels}
          onChange={(e) => set({ includeLabels: e.target.checked })}
        />
        Include metric labels (e.g. &quot;Sum: 60.5&quot; vs &quot;60.5&quot;)
      </label>

      {includeLabels && (
        <label>
          Key-value separator
          <input
            value={params.separator}
            onChange={(e) => set({ separator: e.target.value })}
            placeholder="e.g. :  or , or \t"
          />
          <CharTokens value={params.separator} recognizeEscapes />
        </label>
      )}

      {(hasUniqueOrDup || isFrequency) && (
        <label className="properties__checkbox">
          <input
            type="checkbox"
            checked={params.caseSensitive}
            onChange={(e) => set({ caseSensitive: e.target.checked })}
          />
          Case-sensitive {isFrequency ? "frequency grouping" : "unique row count"}
        </label>
      )}

      <p className="properties__note">
        Connect an <strong>Output</strong> node or select <strong>All rows</strong> in Preview to compute across the full dataset.
      </p>
    </>
  );
}

const REGEX_PRESETS: Array<{ label: string; pattern: string }> = [
  { label: "Email address", pattern: "([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})" },
  { label: "URL (http/https)", pattern: "(https?:\\/\\/[^\\s\"'<>]+)" },
  { label: "IPv4 address", pattern: "(\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b)" },
  { label: "ISO Date (YYYY-MM-DD)", pattern: "(\\b\\d{4}-\\d{2}-\\d{2}\\b)" },
  { label: "Numbers only", pattern: "(-?\\d+(?:\\.\\d+)?)" },
  { label: "Double-quoted string", pattern: "\"([^\"]*)\"" },
  { label: "HTML / XML tags", pattern: "<[^>]+>" },
  { label: "Whitespace (1+)", pattern: "\\s+" },
];

function RegexPresets({ onSelect }: { onSelect: (pattern: string) => void }) {
  return (
    <select
      className="properties__preset-select"
      value=""
      onChange={(e) => {
        if (e.target.value) {
          onSelect(e.target.value);
        }
      }}
      aria-label="Insert regex preset"
      title="Choose a common regular expression preset"
    >
      <option value="" disabled>
        Presets ▾
      </option>
      {REGEX_PRESETS.map((preset) => (
        <option key={preset.label} value={preset.pattern}>
          {preset.label}
        </option>
      ))}
    </select>
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

function ColumnsFields({
  params,
  upstreamRows,
  set,
}: {
  params: OperationParams["columns"];
  upstreamRows: string[];
  set: (patch: Partial<OperationParams["columns"]>) => void;
}) {
  const [dragCol, setDragCol] = useState<number | null>(null);
  const mode = params.mode ?? "keep";
  const outputFormat = params.outputFormat ?? "delimited";
  const firstRow = upstreamRows.find((r) => r.trim().length > 0) ?? "";
  const detectedCols = firstRow
    ? parseCsvColumns(firstRow, params.delimiter ?? ",", params.quoteAware ?? true)
    : [];

  const spec = parseColumnSpec(params.columns ?? "");
  const positiveSpec = spec.filter((c) => c > 0);
  const selectedSet = new Set(positiveSpec);

  const orderedCols: number[] =
    mode === "keep"
      ? [
          ...positiveSpec.filter((c) => c <= detectedCols.length),
          ...detectedCols.map((_, i) => i + 1).filter((c) => !selectedSet.has(c)),
        ]
      : detectedCols.map((_, i) => i + 1);

  function updateSpec(nextCols: number[]) {
    set({ columns: nextCols.join(", ") });
  }

  function toggleCol(colNum: number) {
    if (selectedSet.has(colNum)) {
      updateSpec(positiveSpec.filter((c) => c !== colNum));
    } else {
      updateSpec([...positiveSpec, colNum]);
    }
  }

  function moveCheckedCol(colNum: number, delta: -1 | 1) {
    const idx = positiveSpec.indexOf(colNum);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= positiveSpec.length) return;
    const next = [...positiveSpec];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    updateSpec(next);
  }

  function reorderDraggedCol(fromCol: number, toCol: number) {
    if (fromCol === toCol) return;
    let next = [...positiveSpec];
    if (!next.includes(fromCol)) next.push(fromCol);
    if (!next.includes(toCol)) next.push(toCol);
    const fromIdx = next.indexOf(fromCol);
    const toIdx = next.indexOf(toCol);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    updateSpec(next);
  }

  return (
    <>
      <div className="properties__group-label">
        <span>Column Action</span>
      </div>
      <div className="properties__segment" role="group" aria-label="Columns mode">
        <button
          type="button"
          className={mode === "keep" ? "is-active" : ""}
          onClick={() => set({ mode: "keep" })}
          title="Keep and reorder the selected columns"
        >
          Keep &amp; Reorder
        </button>
        <button
          type="button"
          className={mode === "drop" ? "is-active" : ""}
          onClick={() => set({ mode: "drop" })}
          title="Drop the selected columns and keep all remaining columns"
        >
          Drop Selected
        </button>
      </div>

      <label>
        Input delimiter
        <input
          value={params.delimiter ?? ","}
          onChange={(e) => set({ delimiter: e.target.value })}
          placeholder="e.g. , or \t or |"
        />
        <CharTokens value={params.delimiter ?? ","} recognizeEscapes />
      </label>

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.quoteAware ?? true}
          onChange={(e) => set({ quoteAware: e.target.checked })}
        />
        Quote-aware CSV (ignore delimiters inside quotes)
      </label>

      {detectedCols.length > 1 && (
        <div className="properties__csv-columns">
          <div className="properties__col-checklist-header">
            <span className="properties__csv-columns-title">
              {mode === "keep"
                ? `Check & drag to reorder (${positiveSpec.length} kept)`
                : `Check columns to drop (${positiveSpec.length} dropped)`}
            </span>
            <div className="properties__col-quick-btns">
              <button
                type="button"
                className="properties__col-quick-btn"
                onClick={() => updateSpec(detectedCols.map((_, i) => i + 1))}
              >
                All
              </button>
              <button
                type="button"
                className="properties__col-quick-btn"
                onClick={() => updateSpec([])}
              >
                None
              </button>
              <button
                type="button"
                className="properties__col-quick-btn"
                onClick={() =>
                  updateSpec(
                    detectedCols
                      .map((_, i) => i + 1)
                      .filter((c) => !selectedSet.has(c))
                  )
                }
              >
                Invert
              </button>
            </div>
          </div>

          <div className="properties__col-checklist">
            {orderedCols.map((colNum) => {
              const rawHeader = detectedCols[colNum - 1] ?? "";
              const checked = selectedSet.has(colNum);
              const orderIdx = positiveSpec.indexOf(colNum);
              return (
                <div
                  key={colNum}
                  className={`properties__col-row ${checked ? "is-checked" : ""} ${
                    dragCol === colNum ? "is-dragging" : ""
                  }`}
                  draggable={mode === "keep" && checked}
                  onDragStart={() => setDragCol(colNum)}
                  onDragOver={(e) => {
                    if (mode === "keep" && dragCol !== null) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (mode === "keep" && dragCol !== null) {
                      reorderDraggedCol(dragCol, colNum);
                    }
                    setDragCol(null);
                  }}
                  onDragEnd={() => setDragCol(null)}
                >
                  <label className="properties__col-row-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCol(colNum)}
                    />
                    <span className="properties__col-idx">#{colNum}</span>
                    <span className="properties__col-name" title={rawHeader}>
                      {rawHeader || `(col ${colNum})`}
                    </span>
                  </label>
                  {mode === "keep" && checked && (
                    <div className="properties__col-row-actions">
                      <span className="properties__col-order-badge" title="Output column position">
                        → {orderIdx + 1}
                      </span>
                      <button
                        type="button"
                        className="properties__col-move-btn"
                        disabled={orderIdx <= 0}
                        onClick={() => moveCheckedCol(colNum, -1)}
                        title="Move column earlier"
                        aria-label="Move column up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="properties__col-move-btn"
                        disabled={orderIdx === -1 || orderIdx >= positiveSpec.length - 1}
                        onClick={() => moveCheckedCol(colNum, 1)}
                        title="Move column later"
                        aria-label="Move column down"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label>
        {mode === "keep" ? "Columns to keep (in order, 1-based)" : "Columns to drop (1-based)"}
        <input
          value={params.columns ?? ""}
          onChange={(e) => set({ columns: e.target.value })}
          placeholder="e.g. 2, 1, 3 (or -1 for last column)"
        />
      </label>

      <div className="properties__group-label">
        <span>Output Format</span>
      </div>
      <div className="properties__segment" role="group" aria-label="Output format">
        <button
          type="button"
          className={outputFormat === "delimited" ? "is-active" : ""}
          onClick={() => set({ outputFormat: "delimited" })}
          title="Join selected columns with a custom delimiter (CSV by default)"
        >
          CSV / Custom
        </button>
        <button
          type="button"
          className={outputFormat === "tsv" ? "is-active" : ""}
          onClick={() => set({ outputFormat: "tsv" })}
          title="Join selected columns with tabs (TSV)"
        >
          TSV
        </button>
        <button
          type="button"
          className={outputFormat === "json" ? "is-active" : ""}
          onClick={() => set({ outputFormat: "json", skipHeader: true })}
          title="Convert selected columns into a JSON Array"
        >
          JSON
        </button>
      </div>

      {outputFormat === "delimited" && (
        <label>
          Output delimiter
          <input
            value={params.outputDelimiter ?? ","}
            onChange={(e) => set({ outputDelimiter: e.target.value })}
            placeholder="e.g. , or | or \t"
          />
          <CharTokens value={params.outputDelimiter ?? ","} recognizeEscapes />
        </label>
      )}

      {outputFormat !== "json" && (
        <label>
          Quote output fields
          <select
            value={params.quoteOutput ?? "auto"}
            onChange={(e) =>
              set({ quoteOutput: e.target.value as OperationParams["columns"]["quoteOutput"] })
            }
          >
            <option value="auto">Auto (quote when delimiter/quotes present)</option>
            <option value="always">Always wrap in &quot;...&quot;</option>
            <option value="never">Never quote</option>
          </select>
        </label>
      )}

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.skipHeader ?? false}
          onChange={(e) => set({ skipHeader: e.target.checked })}
        />
        {outputFormat === "json"
          ? "Use 1st row as JSON object keys (CSV header)"
          : "Skip 1st row (CSV header)"}
      </label>

      <label className="properties__checkbox">
        <input
          type="checkbox"
          checked={params.trimValues ?? true}
          onChange={(e) => set({ trimValues: e.target.checked })}
        />
        Trim whitespace around column values
      </label>
    </>
  );
}

function discoverJsonSamplePaths(rows: string[]): string[] {
  const nonEmpty = rows.filter((r) => r.trim().length > 0);
  if (nonEmpty.length === 0) return [];
  let sample: unknown = null;
  try {
    sample = JSON.parse(nonEmpty[0].trim());
  } catch {
    try {
      sample = JSON.parse(rows.join("\n").trim());
    } catch {
      return [];
    }
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  const addPath = (p: string) => {
    if (p && !seen.has(p) && paths.length < 12) {
      seen.add(p);
      paths.push(p);
    }
  };

  const target = Array.isArray(sample) && sample.length > 0 ? sample[0] : sample;
  if (target !== null && typeof target === "object" && !Array.isArray(target)) {
    for (const [k, v] of Object.entries(target as Record<string, unknown>)) {
      addPath(k);
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        for (const subKey of Object.keys(v as Record<string, unknown>)) {
          addPath(`${k}.${subKey}`);
        }
      } else if (Array.isArray(v) && v.length > 0) {
        addPath(`${k}[0]`);
        if (v[0] !== null && typeof v[0] === "object" && !Array.isArray(v[0])) {
          for (const subKey of Object.keys(v[0] as Record<string, unknown>)) {
            addPath(`${k}[*].${subKey}`);
          }
        }
      }
    }
  }
  return paths;
}

function JsonFields({
  params,
  upstreamRows,
  set,
}: {
  params: OperationParams["json"];
  upstreamRows: string[];
  set: (patch: Partial<OperationParams["json"]>) => void;
}) {
  const mode = params.mode ?? "query";
  const detectedPaths = mode === "query" ? discoverJsonSamplePaths(upstreamRows) : [];

  return (
    <>
      <label>
        Operation mode
        <select
          value={mode}
          onChange={(e) =>
            set({ mode: e.target.value as OperationParams["json"]["mode"] })
          }
        >
          <option value="query">Query / Extract Path (e.g. user.email)</option>
          <option value="format">Pretty-Print / Minify JSON</option>
          <option value="kvToJson">Key: Value Lines → JSON Object</option>
          <option value="rowsToJson">Rows → JSON Array</option>
          <option value="jsonToKv">JSON → Key: Value Lines</option>
        </select>
      </label>

      {mode === "query" && (
        <>
          <label>
            Dot / bracket path
            <input
              value={params.path ?? ""}
              onChange={(e) => set({ path: e.target.value })}
              placeholder="e.g. user.email, items[0].id, or items[*].name"
            />
          </label>
          {detectedPaths.length > 0 && (
            <div className="properties__csv-columns">
              <span className="properties__csv-columns-title">
                Detected JSON paths (click to query):
              </span>
              <div className="properties__csv-pills">
                {detectedPaths.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`properties__csv-pill ${params.path === p ? "is-active" : ""}`}
                    onClick={() => set({ path: p })}
                    title={`Query path "${p}"`}
                  >
                    <code>{p}</code>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.flattenArrays ?? true}
              onChange={(e) => set({ flattenArrays: e.target.checked })}
            />
            Expand extracted arrays into separate rows
          </label>
          <label className="properties__checkbox">
            <input
              type="checkbox"
              checked={params.dropMissing ?? true}
              onChange={(e) => set({ dropMissing: e.target.checked })}
            />
            Drop rows where path is missing or invalid JSON
          </label>
          {!(params.dropMissing ?? true) && (
            <label>
              Fallback when missing
              <input
                value={params.missingFallback ?? ""}
                onChange={(e) => set({ missingFallback: e.target.value })}
                placeholder="Optional fallback text"
              />
            </label>
          )}
          <p className="properties__note">
            Works on both <strong>JSON Lines (JSONL)</strong> and multi-line <strong>JSON Objects / Arrays</strong>. Use <code>a.b</code> for nested fields, <code>[0]</code> or <code>[-1]</code> for array indices, or <code>[*]</code> to extract from all items.
          </p>
        </>
      )}

      {(mode === "format" || mode === "kvToJson" || mode === "rowsToJson") && (
        <label>
          JSON indentation
          <select
            value={String(params.indent ?? 2)}
            onChange={(e) => set({ indent: parseInt(e.target.value, 10) || 0 })}
          >
            <option value="2">Pretty-print (2 spaces)</option>
            <option value="4">Pretty-print (4 spaces)</option>
            <option value="0">Minify (1 line)</option>
          </select>
        </label>
      )}

      {(mode === "kvToJson" || mode === "jsonToKv") && (
        <label>
          Key-value separator
          <input
            value={params.kvDelimiter ?? ":"}
            onChange={(e) => set({ kvDelimiter: e.target.value })}
            placeholder="e.g. : or = or \t"
          />
          <CharTokens value={params.kvDelimiter ?? ":"} recognizeEscapes />
        </label>
      )}

      {(mode === "kvToJson" || mode === "rowsToJson") && (
        <label className="properties__checkbox">
          <input
            type="checkbox"
            checked={params.parsePrimitives ?? true}
            onChange={(e) => set({ parsePrimitives: e.target.checked })}
          />
          Auto-convert numbers, booleans (true/false), and null
        </label>
      )}

      {(mode === "format" || mode === "kvToJson") && (
        <label className="properties__checkbox">
          <input
            type="checkbox"
            checked={params.sortKeys ?? false}
            onChange={(e) => set({ sortKeys: e.target.checked })}
          />
          Sort object keys alphabetically
        </label>
      )}

      {mode === "kvToJson" && (
        <p className="properties__note">
          Converts <code>key{params.kvDelimiter || ":"} value</code> rows directly into a single JSON object.
        </p>
      )}
      {mode === "rowsToJson" && (
        <p className="properties__note">
          Wraps all non-empty input rows directly into a JSON array.
        </p>
      )}
      {mode === "jsonToKv" && (
        <p className="properties__note">
          Flattens JSON objects into <code>key{params.kvDelimiter || ":"} value</code> lines (nested keys use dot notation like <code>user.name</code>).
        </p>
      )}
    </>
  );
}
