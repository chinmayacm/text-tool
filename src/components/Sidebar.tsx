import { OPERATION_LABELS, type OperationKind } from "../types";
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

export function Sidebar() {
  function onDragStart(e: React.DragEvent, kind: OperationKind) {
    e.dataTransfer.setData("application/texttool-node", kind);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="sidebar">
      <h2>Nodes</h2>
      <p className="sidebar__hint">Drag onto the canvas</p>
      {KINDS.map((kind) => (
        <div
          key={kind}
          className="sidebar__item"
          draggable
          onDragStart={(e) => onDragStart(e, kind)}
        >
          {OPERATION_LABELS[kind]}
        </div>
      ))}
    </aside>
  );
}
