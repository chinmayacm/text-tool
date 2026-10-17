import { useRef, useState } from "react";
import { OPERATION_LABELS, type OperationKind } from "../types";
import { useGraphStore } from "../store/useGraphStore";
import {
  createProjectArchive,
  createProjectSnapshot,
  readProjectArchive,
} from "../store/projectPersistence";
import type { ProjectSaveStatus } from "../store/useProjectPersistence";
import { setPaletteDragKind } from "./nodeDrag";
import "./Sidebar.css";

const KINDS: OperationKind[] = [
  "input",
  "split",
  "enclose",
  "join",
  "merge",
  "append",
  "trim",
  "replace",
  "case",
  "filter",
  "output",
];

export function Sidebar({
  saveStatus,
  onStartFresh,
}: {
  saveStatus: ProjectSaveStatus;
  onStartFresh: () => Promise<void>;
}) {
  const policyDialogRef = useRef<HTMLDialogElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const restoreProject = useGraphStore((state) => state.restoreProject);
  const nodeCount = useGraphStore((state) => state.nodes.length);
  const [projectError, setProjectError] = useState("");

  function onDragStart(e: React.DragEvent, kind: OperationKind) {
    setPaletteDragKind(kind);
    e.dataTransfer.setData("application/texttool-node", kind);
    e.dataTransfer.effectAllowed = "move";
  }

  async function exportProject() {
    setProjectError("");
    try {
      const snapshot = createProjectSnapshot(useGraphStore.getState());
      const blob = await createProjectArchive(snapshot);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `texttool-project-${new Date().toISOString().slice(0, 10)}.texttool`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setProjectError("Could not export the project.");
    }
  }

  async function importProject(file: File) {
    setProjectError("");
    try {
      const project = await readProjectArchive(file);
      restoreProject(project);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Could not open this project.");
    }
  }

  return (
    <aside className="sidebar">
      <h2>Nodes</h2>
      <p className="sidebar__hint">Drag onto the canvas</p>
      <section className="sidebar__project" aria-label="Project">
        <h3>Project</h3>
        <p className={`sidebar__save-status sidebar__save-status--${saveStatus}`} aria-live="polite">
          {saveStatus === "loading" && "Loading local project…"}
          {saveStatus === "ready" && "Local autosave ready"}
          {saveStatus === "saving" && "Saving on this device…"}
          {saveStatus === "saved" && "Autosaved on this device"}
          {saveStatus === "error" && "Local save unavailable"}
        </p>
        <button type="button" className="sidebar__project-button" onClick={() => void exportProject()}>
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
      </section>
      {KINDS.map((kind) => (
        <div
          key={kind}
          className="sidebar__item"
          draggable
          onDragStart={(e) => onDragStart(e, kind)}
          onDragEnd={() => setPaletteDragKind(null)}
        >
          {OPERATION_LABELS[kind]}
        </div>
      ))}
      <div className="sidebar__footer">
        <button type="button" className="sidebar__policy-link" onClick={() => policyDialogRef.current?.showModal()}>
          Data policy
        </button>
      </div>
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
