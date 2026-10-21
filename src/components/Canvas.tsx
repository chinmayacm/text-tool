import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
  type Viewport,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore, type FlowNode } from "../store/useGraphStore";
import { OperationNode } from "./nodes/OperationNode";
import { getPaletteDragKind, setPaletteDragKind } from "./nodeDrag";
import { OPERATION_DESCRIPTIONS, OPERATION_LABELS, type OperationKind } from "../types";

const PALETTE_KINDS: OperationKind[] = [
  "input",
  "split",
  "join",
  "merge",
  "unmerge",
  "compare",
  "partition",
  "slice",
  "append",
  "trim",
  "enclose",
  "replace",
  "case",
  "filter",
  "sort",
  "unique",
  "number",
  "extract",
  "pad",
  "template",
  "encode",
  "stats",
  "output",
];

const nodeTypes: Record<OperationKind, typeof OperationNode> = {
  input: OperationNode,
  split: OperationNode,
  enclose: OperationNode,
  join: OperationNode,
  merge: OperationNode,
  unmerge: OperationNode,
  compare: OperationNode,
  partition: OperationNode,
  slice: OperationNode,
  append: OperationNode,
  trim: OperationNode,
  replace: OperationNode,
  case: OperationNode,
  filter: OperationNode,
  sort: OperationNode,
  unique: OperationNode,
  number: OperationNode,
  extract: OperationNode,
  pad: OperationNode,
  template: OperationNode,
  encode: OperationNode,
  stats: OperationNode,
  output: OperationNode,
};

export function Canvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const quickSearchRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, setViewport: applyViewport, fitView } = useReactFlow();

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddQuery, setQuickAddQuery] = useState("");
  const [quickAddIndex, setQuickAddIndex] = useState(0);
  const [quickAddFlowPos, setQuickAddFlowPos] = useState<{ x: number; y: number } | undefined>(undefined);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const viewport = useGraphStore((s) => s.viewport);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onDelete = useGraphStore((s) => s.onDelete);
  const onConnect = useGraphStore((s) => s.onConnect);
  const addNode = useGraphStore((s) => s.addNode);
  const quickAddNode = useGraphStore((s) => s.quickAddNode);
  const tidyGraph = useGraphStore((s) => s.tidyGraph);
  const toggleNodeBypass = useGraphStore((s) => s.toggleNodeBypass);
  const spliceNodeIntoEdge = useGraphStore((s) => s.spliceNodeIntoEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setSavedViewport = useGraphStore((s) => s.setViewport);
  const copySelected = useGraphStore((s) => s.copySelected);
  const pasteSelected = useGraphStore((s) => s.pasteSelected);
  const connectMagnetically = useGraphStore((s) => s.connectMagnetically);
  const magnet = useRef<MagnetState>({ x: 0, y: 0, t: 0, targetId: null, since: 0, engaged: false });
  const lineRef = useRef<SVGLineElement>(null);
  const dwellTimer = useRef<number | null>(null);
  const paletteMagnet = useRef<{ targetId: string | null; engaged: boolean; y: number }>({
    targetId: null,
    engaged: false,
    y: 0,
  });
  const lastAppliedViewport = useRef<Viewport | null>(viewport);

  useEffect(() => {
    if (!viewport || lastAppliedViewport.current === viewport) return;
    lastAppliedViewport.current = viewport;
    void applyViewport(viewport);
  }, [viewport, applyViewport]);

  /** Finds the edge (if any) rendered directly under or near a viewport point, so dropped nodes can splice into it. */
  function findEdgeIdAtPoint(x: number, y: number): string | undefined {
    const offsets = [
      [0, 0], [0, -10], [0, 10], [-10, 0], [10, 0],
      [-15, -15], [15, -15], [-15, 15], [15, 15],
      [0, -25], [0, 25], [-25, 0], [25, 0],
    ];
    for (const [dx, dy] of offsets) {
      for (const el of document.elementsFromPoint(x + dx, y + dy)) {
        const edgeEl = (el as Element).closest(".react-flow__edge");
        if (edgeEl) {
          const id = edgeEl.getAttribute("data-id");
          if (id) return id;
        }
      }
    }
    return undefined;
  }

  function clearPaletteMagnet() {
    if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
    dwellTimer.current = null;
    paletteMagnet.current.targetId = null;
    paletteMagnet.current.engaged = false;
    setMagnetClass(null);
    hideMagnetLine(lineRef.current);
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/texttool-node") as OperationKind;
      if (!kind) {
        clearPaletteMagnet();
        setPaletteDragKind(null);
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const { targetId, engaged } = paletteMagnet.current;
      clearPaletteMagnet();
      setPaletteDragKind(null);
      const edgeId = engaged ? undefined : findEdgeIdAtPoint(e.clientX, e.clientY);
      const newNodeId = addNode(kind, position, edgeId);
      if (engaged && targetId) {
        connectMagnetically(newNodeId, targetId, position.x, handleAt(targetId, e.clientY), null);
      }
    },
    [screenToFlowPosition, addNode, connectMagnetically]
  );

  const onCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!getPaletteDragKind()) return;
    const targetId = findNodeIdAtPoint(e.clientX, e.clientY);
    if (!targetId) {
      clearPaletteMagnet();
      return;
    }
    paletteMagnet.current.y = e.clientY;
    if (paletteMagnet.current.targetId === targetId) return;

    clearPaletteMagnet();
    paletteMagnet.current.targetId = targetId;
    const hoverX = e.clientX;
    const hoverY = e.clientY;
    dwellTimer.current = window.setTimeout(() => {
      dwellTimer.current = null;
      if (paletteMagnet.current.targetId !== targetId) return;
      paletteMagnet.current.engaged = true;
      setMagnetClass(targetId);
      drawMagnetLineToNode(wrapperRef.current, lineRef.current, hoverX, hoverY, targetId);
    }, DWELL_MS);
  }, []);

  const onSelectionChange: OnSelectionChangeFunc<FlowNode> = useCallback(
    ({ nodes: selected }) => setSelectedNode(selected.length ? selected[selected.length - 1].id : null),
    [setSelectedNode]
  );

  const filteredKinds = useMemo(() => {
    const q = quickAddQuery.trim().toLowerCase();
    if (!q) return PALETTE_KINDS;
    return PALETTE_KINDS.filter(
      (kind) =>
        OPERATION_LABELS[kind].toLowerCase().includes(q) ||
        kind.toLowerCase().includes(q) ||
        OPERATION_DESCRIPTIONS[kind].toLowerCase().includes(q)
    );
  }, [quickAddQuery]);

  const openQuickAdd = useCallback((flowPos?: { x: number; y: number }) => {
    setQuickAddQuery("");
    setQuickAddIndex(0);
    setQuickAddFlowPos(flowPos);
    setQuickAddOpen(true);
    window.setTimeout(() => {
      quickSearchRef.current?.focus();
    }, 0);
  }, []);

  const handleSelectQuickAdd = useCallback(
    (kind: OperationKind) => {
      quickAddNode(kind, quickAddFlowPos);
      setQuickAddOpen(false);
    },
    [quickAddNode, quickAddFlowPos]
  );

  const handleTidyGraph = useCallback(() => {
    tidyGraph();
    window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 220 });
    }, 20);
  }, [tidyGraph, fitView]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === "k") {
          event.preventDefault();
          openQuickAdd();
          return;
        }
        if (key === "c") {
          if (hasTextSelection()) return;
          if (copySelected()) event.preventDefault();
        } else if (key === "v") {
          if (pasteSelected()) event.preventDefault();
        }
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "/") {
          event.preventDefault();
          openQuickAdd();
        } else if (key === "b" || key === "m") {
          if (selectedNodeId) {
            event.preventDefault();
            toggleNodeBypass(selectedNodeId);
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelected, pasteSelected, openQuickAdd, selectedNodeId, toggleNodeBypass]);

  const onNodeDragStart: OnNodeDrag<FlowNode> = useCallback((event) => {
    if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
    const point = pointerFrom(event);
    magnet.current = {
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      t: performance.now(),
      targetId: null,
      since: 0,
      engaged: false,
    };
  }, []);

  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback((event, node) => {
    if (event.ctrlKey || event.metaKey) {
      if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
      clearMagnet(magnet.current, lineRef.current);
      return;
    }
    const point = pointerFrom(event);
    if (!point) return;
    const now = performance.now();
    const dt = Math.max(1, now - magnet.current.t);
    const speed = Math.hypot(point.x - magnet.current.x, point.y - magnet.current.y) / dt;
    magnet.current.x = point.x;
    magnet.current.y = point.y;
    magnet.current.t = now;

    const under = findOverlappedNodeId(node.id);
    if (!under || speed > YANK_PX_PER_MS) {
      if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
      clearMagnet(magnet.current, lineRef.current);
      return;
    }
    if (speed > SLOW_PX_PER_MS) {
      if (magnet.current.engaged) {
        if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
        dwellTimer.current = null;
        clearMagnet(magnet.current, lineRef.current);
      } else if (magnet.current.targetId !== under) {
        magnet.current.targetId = under;
        magnet.current.since = now;
      }
      return;
    }
    if (magnet.current.targetId !== under) {
      if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
      magnet.current.targetId = under;
      magnet.current.since = now;
      magnet.current.engaged = false;
      setMagnetClass(null);
      hideMagnetLine(lineRef.current);
    }
    if (!magnet.current.engaged && dwellTimer.current === null) {
      dwellTimer.current = window.setTimeout(() => {
        dwellTimer.current = null;
        if (magnet.current.targetId !== under || findOverlappedNodeId(node.id) !== under) return;
        magnet.current.engaged = true;
        setMagnetClass(under);
        drawMagnetLine(wrapperRef.current, lineRef.current, node.id, under);
      }, DWELL_MS);
    }
    if (magnet.current.engaged) drawMagnetLine(wrapperRef.current, lineRef.current, node.id, under);
  }, []);

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (event, node) => {
      const point = pointerFrom(event);
      const engaged = magnet.current.engaged;
      const targetId = magnet.current.targetId;
      if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
      clearMagnet(magnet.current, lineRef.current);

      if ((event.ctrlKey || event.metaKey) && point) {
        const edgeId = findEdgeIdAtPoint(point.x, point.y);
        if (edgeId) {
          spliceNodeIntoEdge(node.id, edgeId);
          return;
        }
      }
      if (engaged && targetId) {
        connectMagnetically(
          node.id,
          targetId,
          node.position.x,
          point ? handleAt(targetId, point.y) : null,
          point ? handleAt(node.id, point.y) : null
        );
      }
    },
    [spliceNodeIntoEdge, connectMagnetically]
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      removeEdge(edge.id);
    },
    [removeEdge]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div
      className="canvas"
      ref={wrapperRef}
      onDrop={onDrop}
      onDragOver={onCanvasDragOver}
      onDragLeave={(e) => {
        if (e.relatedTarget instanceof Node && wrapperRef.current?.contains(e.relatedTarget)) return;
        clearPaletteMagnet();
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && target.classList.contains("react-flow__pane")) {
          openQuickAdd(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }
      }}
    >
      <div className="canvas__toolbar" role="toolbar" aria-label="Canvas actions">
        <button
          type="button"
          className="canvas__tool-btn"
          onClick={() => openQuickAdd()}
          title="Quick-add node and auto-connect (/ or Ctrl+K or double-click canvas)"
        >
          ＋ Quick Add <kbd>/</kbd>
        </button>
        <button
          type="button"
          className="canvas__tool-btn"
          onClick={handleTidyGraph}
          title="Auto-arrange nodes into clean left-to-right topological columns"
        >
          ✦ Tidy Graph
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDelete={onDelete}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onMoveEnd={(_, nextViewport) => {
          lastAppliedViewport.current = nextViewport;
          setSavedViewport(nextViewport);
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        defaultViewport={viewport ?? undefined}
        fitView={!viewport}
        zoomOnDoubleClick={false}
        colorMode="dark"
        connectionRadius={45}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Control", "Meta"]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnScroll
        panOnDrag={[1, 2]}
        selectionKeyCode="Shift"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      {quickAddOpen && (
        <div
          className="quick-add-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setQuickAddOpen(false);
          }}
        >
          <div className="quick-add-modal" role="dialog" aria-label="Quick add node">
            <div className="quick-add-header">
              <input
                ref={quickSearchRef}
                type="text"
                className="quick-add-input"
                value={quickAddQuery}
                onChange={(e) => {
                  setQuickAddQuery(e.target.value);
                  setQuickAddIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setQuickAddOpen(false);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setQuickAddIndex((i) =>
                      filteredKinds.length > 0 ? (i + 1) % filteredKinds.length : 0
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setQuickAddIndex((i) =>
                      filteredKinds.length > 0
                        ? (i - 1 + filteredKinds.length) % filteredKinds.length
                        : 0
                    );
                  } else if (e.key === "Enter" && filteredKinds.length > 0) {
                    e.preventDefault();
                    const picked = filteredKinds[Math.min(quickAddIndex, filteredKinds.length - 1)];
                    if (picked) handleSelectQuickAdd(picked);
                  }
                }}
                placeholder="Type a node name to add (e.g. filter, sort, stats)…"
                aria-label="Search nodes to add"
              />
              <span className="quick-add-kbd">Esc</span>
            </div>
            <div className="quick-add-list" role="listbox">
              {filteredKinds.length === 0 ? (
                <div className="quick-add-empty">No matching nodes</div>
              ) : (
                filteredKinds.map((kind, idx) => {
                  const isActive = idx === Math.min(quickAddIndex, filteredKinds.length - 1);
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`quick-add-item ${isActive ? "is-active" : ""}`}
                      onMouseEnter={() => setQuickAddIndex(idx)}
                      onClick={() => handleSelectQuickAdd(kind)}
                    >
                      <span className="quick-add-item__name">{OPERATION_LABELS[kind]}</span>
                      <span className="quick-add-item__desc">{OPERATION_DESCRIPTIONS[kind]}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="quick-add-footer">
              {selectedNode ? (
                selectedNode.data.kind === "output" ? (
                  <span>
                    Will insert before <strong>{selectedNode.data.label}</strong>
                  </span>
                ) : (
                  <span>
                    Will auto-connect after <strong>{selectedNode.data.label}</strong>
                  </span>
                )
              ) : (
                <span>Will place on canvas</span>
              )}
              <span>↑↓ navigate · Enter add</span>
            </div>
          </div>
        </div>
      )}
      <svg className="magnet-overlay" aria-hidden="true">
        <line ref={lineRef} />
      </svg>
    </div>
  );
}

const SLOW_PX_PER_MS = 0.4;
const YANK_PX_PER_MS = 1.05;
const DWELL_MS = 160;

type MagnetState = {
  x: number;
  y: number;
  t: number;
  targetId: string | null;
  since: number;
  engaged: boolean;
};

function pointerFrom(event: Parameters<OnNodeDrag<FlowNode>>[0]): { x: number; y: number } | null {
  if ("clientX" in event) return { x: event.clientX, y: event.clientY };
  const touch = ("touches" in event && event.touches?.[0]) || ("changedTouches" in event && event.changedTouches?.[0]);
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function findOverlappedNodeId(draggedId: string): string | undefined {
  const dragged = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(draggedId)}"]`);
  if (!dragged) return undefined;
  const draggedRect = dragged.getBoundingClientRect();
  let bestId: string | undefined;
  let bestArea = 0;
  for (const candidate of document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")) {
    const id = candidate.getAttribute("data-id");
    if (!id || id === draggedId) continue;
    const rect = candidate.getBoundingClientRect();
    const width = Math.max(0, Math.min(draggedRect.right, rect.right) - Math.max(draggedRect.left, rect.left));
    const height = Math.max(0, Math.min(draggedRect.bottom, rect.bottom) - Math.max(draggedRect.top, rect.top));
    const area = width * height;
    if (area > bestArea) {
      bestArea = area;
      bestId = id;
    }
  }
  return bestId;
}

function findNodeIdAtPoint(x: number, y: number): string | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const nodeEl = (el as Element).closest(".react-flow__node");
    const id = nodeEl?.getAttribute("data-id");
    if (id) return id;
  }
  return undefined;
}

function handleAt(nodeId: string, clientY: number): string | null {
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  if (!el) return "a";
  const rect = el.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? "a" : "b";
}

function setMagnetClass(id: string | null) {
  document.querySelectorAll(".magnet-target").forEach((el) => el.classList.remove("magnet-target"));
  if (!id) return;
  document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.classList.add("magnet-target");
}

function hideMagnetLine(line: SVGLineElement | null) {
  if (line) line.style.display = "none";
}

function clearMagnet(state: MagnetState, line: SVGLineElement | null) {
  state.engaged = false;
  state.targetId = null;
  state.since = 0;
  setMagnetClass(null);
  hideMagnetLine(line);
}

function drawMagnetLine(wrapper: HTMLDivElement | null, line: SVGLineElement | null, fromId: string, toId: string) {
  if (!wrapper || !line) return;
  const from = nodeCenter(fromId, wrapper);
  const to = nodeCenter(toId, wrapper);
  if (!from || !to) return;
  line.style.display = "block";
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
}

function drawMagnetLineToNode(
  wrapper: HTMLDivElement | null,
  line: SVGLineElement | null,
  x: number,
  y: number,
  toId: string
) {
  if (!wrapper || !line) return;
  const to = nodeCenter(toId, wrapper);
  if (!to) return;
  const bounds = wrapper.getBoundingClientRect();
  line.style.display = "block";
  line.setAttribute("x1", String(x - bounds.left));
  line.setAttribute("y1", String(y - bounds.top));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
}

function nodeCenter(id: string, wrapper: HTMLElement): { x: number; y: number } | null {
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const bounds = wrapper.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
}
