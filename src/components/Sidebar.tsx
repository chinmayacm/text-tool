import { useEffect, useRef, useState } from "react";
import { OPERATION_DESCRIPTIONS, OPERATION_LABELS, type OperationKind } from "../types";
import { GRAPH_TEMPLATES } from "../templates";
import { useGraphStore } from "../store/useGraphStore";
import {
  createProjectArchive,
  createProjectSnapshot,
  readProjectArchive,
} from "../store/projectPersistence";
import type { ProjectSaveStatus } from "../store/useProjectPersistence";
import { setPaletteDragKind } from "./nodeDrag";
import "./Sidebar.css";

const NODE_GROUPS: Array<{ label: string; group: string; kinds: OperationKind[] }> = [
  {
    label: "I/O",
    group: "io",
    kinds: ["input", "output"],
  },
  {
    label: "Structure & Combine",
    group: "structure",
    kinds: ["split", "join", "merge", "unmerge", "compare", "partition", "slice", "append"],
  },
  {
    label: "Transform & Filter",
    group: "transform",
    kinds: ["trim", "enclose", "replace", "case", "filter", "sort", "unique", "number", "extract", "pad", "template"],
  },
];

export function Sidebar({
  saveStatus,
  onStartFresh,
}: {
  saveStatus: ProjectSaveStatus;
  onStartFresh: () => Promise<void>;
}) {
  const policyDialogRef = useRef<HTMLDialogElement>(null);
  const exportDialogRef = useRef<HTMLDialogElement>(null);
  const exportInputRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const restoreProject = useGraphStore((state) => state.restoreProject);
  const applyTemplate = useGraphStore((state) => state.applyTemplate);
  const nodeCount = useGraphStore((state) => state.nodes.length);
  const [projectError, setProjectError] = useState("");
  const [exportFilename, setExportFilename] = useState(
    () => `texttool-project-${new Date().toISOString().slice(0, 10)}`
  );
  const [projectOpen, setProjectOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [nodesOpen, setNodesOpen] = useState(true);
  const [tooltip, setTooltip] = useState<{ kind: OperationKind; top: number; left: number } | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  function clearHoverTooltip() {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltip(null);
  }

  function onItemMouseEnter(e: React.MouseEvent<HTMLDivElement>, kind: OperationKind) {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      setTooltip({
        kind,
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
      });
    }, 550);
  }

  function onDragStart(e: React.DragEvent, kind: OperationKind) {
    clearHoverTooltip();
    setPaletteDragKind(kind);
    e.dataTransfer.setData("application/texttool-node", kind);
    e.dataTransfer.effectAllowed = "move";
  }

  function openExportDialog() {
    setProjectError("");
    if (!exportFilename.trim()) {
      setExportFilename(`texttool-project-${new Date().toISOString().slice(0, 10)}`);
    }
    exportDialogRef.current?.showModal();
    window.setTimeout(() => {
      exportInputRef.current?.focus();
      exportInputRef.current?.select();
    }, 0);
  }

  async function exportProject(rawName: string) {
    setProjectError("");
    const trimmed = rawName.trim() || `texttool-project-${new Date().toISOString().slice(0, 10)}`;
    const finalName = trimmed.toLowerCase().endsWith(".texttool") ? trimmed : `${trimmed}.texttool`;
    try {
      const snapshot = createProjectSnapshot(useGraphStore.getState());
      const blob = await createProjectArchive(snapshot);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = finalName;
      link.click();
      URL.revokeObjectURL(url);
      exportDialogRef.current?.close();
    } catch {
      setProjectError("Could not export the project.");
    }
  }

  async function importProject(file: File) {
    setProjectError("");
    try {
      const project = await readProjectArchive(file);
      restoreProject(project);
      const baseName = file.name.replace(/\.texttool$/i, "").trim();
      if (baseName) setExportFilename(baseName);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Could not open this project.");
    }
  }

  return (
    <aside className="sidebar" onScroll={clearHoverTooltip}>
      <section className="sidebar__section" aria-label="Project">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={projectOpen}
          onClick={() => setProjectOpen((open) => !open)}
        >
          <span>Project</span>
          <span className="sidebar__chevron" aria-hidden="true">{projectOpen ? "▾" : "▸"}</span>
        </button>
        {projectOpen && (
          <div className="sidebar__section-body">
            <p className={`sidebar__save-status sidebar__save-status--${saveStatus}`} aria-live="polite">
              {saveStatus === "loading" && "Loading local project…"}
              {saveStatus === "ready" && "Local autosave ready"}
              {saveStatus === "saving" && "Saving on this device…"}
              {saveStatus === "saved" && "Autosaved on this device"}
              {saveStatus === "error" && "Local save unavailable"}
            </p>
            <button type="button" className="sidebar__project-button" onClick={openExportDialog}>
              Export project
            </button>
            <button type="button" className="sidebar__project-button" onClick={() => projectFileRef.current?.click()}>
              Open project
            </button>
            <button
              type="button"
              className="sidebar__project-button sidebar__project-button--destructive"
              onClick={() => {
                if (window.confirm("Start a fresh project? This replaces your current autosaved work. Export a copy first if you want to keep it.")) {
                  setExportFilename(`texttool-project-${new Date().toISOString().slice(0, 10)}`);
                  void onStartFresh();
                }
              }}
            >
              Start fresh
            </button>
            <input
              ref={projectFileRef}
              className="sidebar__file-input"
              type="file"
              accept=".texttool,application/vnd.texttool.project+zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importProject(file);
              }}
            />
            {projectError && <p className="sidebar__project-error" role="alert">{projectError}</p>}
            <p className="sidebar__project-note">{nodeCount} node(s) in current project</p>
          </div>
        )}
      </section>

      <section className="sidebar__section" aria-label="Templates">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={templatesOpen}
          onClick={() => setTemplatesOpen((open) => !open)}
        >
          <span>Templates</span>
          <span className="sidebar__chevron" aria-hidden="true">{templatesOpen ? "▾" : "▸"}</span>
        </button>
        {templatesOpen && (
          <div className="sidebar__section-body">
            <p className="sidebar__hint">Load a starter graph</p>
            {GRAPH_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="sidebar__template-button"
                onClick={() => {
                  applyTemplate(template.id);
                  setExportFilename(template.id);
                }}
              >
                <span className="sidebar__template-name">{template.name}</span>
                <span className="sidebar__template-desc">{template.description}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="sidebar__section sidebar__section--nodes" aria-label="Nodes">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={nodesOpen}
          onClick={() => setNodesOpen((open) => !open)}
        >
          <span>Nodes</span>
          <span className="sidebar__chevron" aria-hidden="true">{nodesOpen ? "▾" : "▸"}</span>
        </button>
        {nodesOpen && (
          <div className="sidebar__section-body">
            <p className="sidebar__hint">Drag onto the canvas</p>
            {NODE_GROUPS.map((section) => (
              <div key={section.group} className="sidebar__node-group">
                <div className="sidebar__group-label">{section.label}</div>
                {section.kinds.map((kind) => (
                  <div
                    key={kind}
                    className={`sidebar__item sidebar__item--${section.group} sidebar__item--${kind}`}
                    draggable
                    onMouseEnter={(e) => onItemMouseEnter(e, kind)}
                    onMouseLeave={clearHoverTooltip}
                    onDragStart={(e) => onDragStart(e, kind)}
                    onDragEnd={() => setPaletteDragKind(null)}
                  >
                    {OPERATION_LABELS[kind]}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
      {tooltip && (
        <div
          className="sidebar__tooltip"
           role="tooltip"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          <strong>{OPERATION_LABELS[tooltip.kind]}:</strong> {OPERATION_DESCRIPTIONS[tooltip.kind]}
        </div>
      )}
      <div className="sidebar__footer">
        <a
          className="sidebar__policy-link"
          href="https://github.com/chinmayacm/text-tool/blob/master/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Documentation
        </a>
        <button type="button" className="sidebar__policy-link" onClick={() => policyDialogRef.current?.showModal()}>
          Data policy
        </button>
      </div>
      <dialog
        ref={exportDialogRef}
        className="data-policy export-dialog"
        aria-labelledby="export-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) exportDialogRef.current?.close();
        }}
      >
        <form
          className="data-policy__content"
          onSubmit={(event) => {
            event.preventDefault();
            void exportProject(exportFilename);
          }}
        >
          <h2 id="export-dialog-title">Export project</h2>
          <p>Choose a file name for your exported project archive:</p>
          <div className="export-dialog__input-row">
            <input
              ref={exportInputRef}
              type="text"
              className="export-dialog__input"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              placeholder="texttool-project"
              aria-label="Project file name"
            />
            <span className="export-dialog__ext">.texttool</span>
          </div>
          <div className="export-dialog__actions">
            <button
              type="button"
              className="export-dialog__cancel"
              onClick={() => exportDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit">Save file</button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={policyDialogRef}
        className="data-policy"
        aria-labelledby="data-policy-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) policyDialogRef.current?.close();
        }}
      >
        <div className="data-policy__content">
          <h2 id="data-policy-title">Your data stays on your device</h2>
          <p>
            Text, files, and graph data are processed in this browser. The app has no backend server and does not upload your content. Autosave stores the latest project and its files in this browser on your device.
          </p>
          <p>
            Browser site data can be cleared by your browser settings, which removes the local autosave. Exported project files are saved only when you choose to export them.
          </p>
          <button type="button" autoFocus onClick={() => policyDialogRef.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </aside>
  );
}
