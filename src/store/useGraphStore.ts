import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { defaultParams, isDualInputKind, isDualOutputKind, OPERATION_LABELS, type NodeData, type OperationKind, type OperationParams, type Rows } from "../types.ts";
import { readFileRows, readPreviewText, splitInputText, type PreviewDirection } from "../engine/textSource.ts";
import { evaluateGraph } from "../engine/evaluate.ts";
import { parseCsvColumns } from "../engine/operations.ts";
import { pasteClipboard, snapshotSelection, type NodeClipboard } from "./clipboard.ts";
import { copyInputFile, forgetInputFile, getInputFile, replaceInputFiles, setInputFile } from "./inputFiles.ts";
import { planMagneticConnection } from "./magnet.ts";
import type { ProjectSnapshot } from "./projectPersistence.ts";
import { createStarterGraph, GRAPH_TEMPLATES } from "../templates.ts";

export type FlowNode = Node<NodeData<OperationKind>>;

export type PreviewRowLimitMode = "5" | "10" | "50" | "custom" | "all";
export type PreviewCharLimitMode = "100" | "500" | "1000" | "custom" | "all";
export type { PreviewDirection };

const previewRows = new Map<string, Rows>();
let previewToken = 0;

function getRowLimit(mode: PreviewRowLimitMode, custom: number): number | undefined {
  if (mode === "all") return undefined;
  if (mode === "custom") return Math.max(1, custom || 1);
  return parseInt(mode, 10);
}

function getCharLimit(mode: PreviewCharLimitMode, custom: number): number | undefined {
  if (mode === "all") return undefined;
  if (mode === "custom") return Math.max(1, custom || 1);
  return parseInt(mode, 10);
}

function isFileInput(node: FlowNode): boolean {
  return node.data.kind === "input" && (node.data.params as OperationParams["input"]).source === "file";
}

function hasFileInput(nodes: FlowNode[]): boolean {
  return nodes.some(isFileInput);
}

function normalizeInputSlot(kind: OperationKind | undefined, handle: string | null | undefined): string | null {
  if (!isDualInputKind(kind)) return null;
  return handle === "b" ? "b" : "a";
}

function normalizeOutputSlot(kind: OperationKind | undefined, handle: string | null | undefined): string | null {
  if (!isDualOutputKind(kind)) return null;
  return handle === "b" ? "b" : "a";
}

export function replaceTargetInputEdge(
  edges: Edge[],
  nodes: Array<{ id: string; data?: { kind?: OperationKind } }>,
  targetId: string,
  targetHandle: string | null | undefined
): Edge[] {
  const targetKind = nodes.find((node) => node.id === targetId)?.data?.kind;
  if (!isDualInputKind(targetKind)) {
    return edges.filter((edge) => edge.target !== targetId);
  }
  const slot = normalizeInputSlot(targetKind, targetHandle);
  return edges.filter(
    (edge) => !(edge.target === targetId && normalizeInputSlot(targetKind, edge.targetHandle) === slot)
  );
}

export function bridgeDeletedNodes(
  remainingNodes: Array<{ id: string; data?: { kind?: OperationKind } }>,
  remainingEdges: Edge[],
  deletedNodes: Pick<FlowNode, "id">[],
  deletedEdges: Edge[]
): Edge[] {
  if (deletedNodes.length === 0 || deletedEdges.length === 0) return remainingEdges;

  const deletedIds = new Set(deletedNodes.map((node) => node.id));
  const survivingIds = new Set(remainingNodes.map((node) => node.id));

  const incomingByTarget = new Map<string, Edge[]>();
  for (const edge of deletedEdges) {
    if (!deletedIds.has(edge.target)) continue;
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }
  for (const list of incomingByTarget.values()) {
    list.sort((a, b) => {
      const rank = (h: string | null | undefined) => (!h || h === "a" ? 0 : 1);
      return rank(a.targetHandle) - rank(b.targetHandle);
    });
  }

  function findSurvivingSource(startNodeId: string): { id: string; sourceHandle: string | null } | null {
    const visited = new Set<string>();
    const queue = [startNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const incoming = incomingByTarget.get(current) ?? [];
      for (const edge of incoming) {
        if (survivingIds.has(edge.source)) {
          return { id: edge.source, sourceHandle: edge.sourceHandle ?? null };
        }
        if (deletedIds.has(edge.source) && !visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }
    return null;
  }

  let nextEdges = [...remainingEdges];
  for (const outEdge of deletedEdges) {
    if (!deletedIds.has(outEdge.source) || !survivingIds.has(outEdge.target)) continue;
    const targetKind = remainingNodes.find((n) => n.id === outEdge.target)?.data?.kind;
    const targetHandle = outEdge.targetHandle ?? null;
    const handleOccupied = nextEdges.some((edge) => {
      if (edge.target !== outEdge.target) return false;
      if (targetKind !== undefined && !isDualInputKind(targetKind)) return true;
      return (edge.targetHandle ?? null) === targetHandle;
    });
    if (handleOccupied) continue;

    const survivingSource = findSurvivingSource(outEdge.source);
    if (!survivingSource || survivingSource.id === outEdge.target) continue;

    nextEdges = addEdge(
      {
        source: survivingSource.id,
        target: outEdge.target,
        sourceHandle: survivingSource.sourceHandle,
        targetHandle,
      },
      nextEdges
    );
  }

  return nextEdges;
}

export type LayoutDirection = "horizontal" | "vertical";

export function layoutGraphTopologically(
  nodes: FlowNode[],
  edges: Edge[],
  direction: LayoutDirection = "horizontal"
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Edge[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) {
    if (nodeById.has(e.source) && nodeById.has(e.target)) {
      incoming.get(e.target)!.push(e);
    }
  }

  const colById = new Map<string, number>();
  const visiting = new Set<string>();

  function getCol(id: string): number {
    if (colById.has(id)) return colById.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const inc = incoming.get(id) ?? [];
    let col = 0;
    for (const e of inc) {
      col = Math.max(col, getCol(e.source) + 1);
    }
    visiting.delete(id);
    colById.set(id, col);
    return col;
  }

  for (const n of nodes) getCol(n.id);

  const columns = new Map<number, FlowNode[]>();
  for (const n of nodes) {
    const c = colById.get(n.id) ?? 0;
    const list = columns.get(c) ?? [];
    list.push(n);
    columns.set(c, list);
  }

  const sortedCols = [...columns.keys()].sort((a, b) => a - b);
  const newPosById = new Map<string, { x: number; y: number }>();

  if (direction === "vertical") {
    const assignedX = new Map<string, number>();
    const ROW_START_Y = 70;
    const ROW_GAP_Y = 155;
    const COL_GAP_X = 250;
    const CENTER_X = 400;

    for (const c of sortedCols) {
      const rowNodes = columns.get(c)!;
      rowNodes.sort((a, b) => {
        const incA = incoming.get(a.id) ?? [];
        const incB = incoming.get(b.id) ?? [];
        const barycenter = (inc: Edge[], fallbackX: number): number => {
          if (inc.length === 0) return fallbackX;
          let sum = 0;
          for (const e of inc) {
            const srcX = assignedX.get(e.source) ?? nodeById.get(e.source)?.position.x ?? CENTER_X;
            const srcOffset = e.sourceHandle === "b" ? 35 : e.sourceHandle === "a" ? -35 : 0;
            const tgtOffset = e.targetHandle === "b" ? 25 : e.targetHandle === "a" ? -25 : 0;
            sum += srcX + srcOffset + tgtOffset;
          }
          return sum / inc.length;
        };
        const scoreA = barycenter(incA, a.position.x);
        const scoreB = barycenter(incB, b.position.x);
        if (Math.abs(scoreA - scoreB) > 1) return scoreA - scoreB;
        return a.position.x - b.position.x;
      });

      const startX = CENTER_X - ((rowNodes.length - 1) * COL_GAP_X) / 2;
      rowNodes.forEach((node, idx) => {
        const x = Math.round(startX + idx * COL_GAP_X);
        const y = ROW_START_Y + c * ROW_GAP_Y;
        assignedX.set(node.id, x);
        newPosById.set(node.id, { x, y });
      });
    }
  } else {
    const assignedY = new Map<string, number>();
    const COL_START_X = 80;
    const COL_GAP_X = 250;
    const ROW_GAP_Y = 130;
    const CENTER_Y = 220;

    for (const c of sortedCols) {
      const colNodes = columns.get(c)!;
      colNodes.sort((a, b) => {
        const incA = incoming.get(a.id) ?? [];
        const incB = incoming.get(b.id) ?? [];
        const barycenter = (inc: Edge[], fallbackY: number): number => {
          if (inc.length === 0) return fallbackY;
          let sum = 0;
          for (const e of inc) {
            const srcY = assignedY.get(e.source) ?? nodeById.get(e.source)?.position.y ?? CENTER_Y;
            const srcOffset = e.sourceHandle === "b" ? 30 : e.sourceHandle === "a" ? -30 : 0;
            const tgtOffset = e.targetHandle === "b" ? 20 : e.targetHandle === "a" ? -20 : 0;
            sum += srcY + srcOffset + tgtOffset;
          }
          return sum / inc.length;
        };
        const scoreA = barycenter(incA, a.position.y);
        const scoreB = barycenter(incB, b.position.y);
        if (Math.abs(scoreA - scoreB) > 1) return scoreA - scoreB;
        return a.position.y - b.position.y;
      });

      const startY = CENTER_Y - ((colNodes.length - 1) * ROW_GAP_Y) / 2;
      colNodes.forEach((node, idx) => {
        const x = COL_START_X + c * COL_GAP_X;
        const y = Math.round(startY + idx * ROW_GAP_Y);
        assignedY.set(node.id, y);
        newPosById.set(node.id, { x, y });
      });
    }
  }

  return nodes.map((node) => {
    const nextPos = newPosById.get(node.id);
    return nextPos ? { ...node, position: nextPos } : node;
  });
}

interface HistorySnapshot {
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  layoutDirection: LayoutDirection;
}

const MAX_HISTORY = 50;
let lastCommitMeta = { key: "", time: 0 };

function cloneHistorySnapshot(state: {
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  layoutDirection: LayoutDirection;
}): HistorySnapshot {
  return {
    nodes: state.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      data: {
        ...n.data,
        params: structuredClone(n.data.params),
      },
    })),
    edges: state.edges.map((e) => ({ ...e })),
    selectedNodeId: state.selectedNodeId,
    layoutDirection: state.layoutDirection,
  };
}

interface GraphState {
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  pinnedNodeId: string | null;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  viewport: Viewport | null;
  outputs: Map<string, Rows>;
  fullOutputs: Map<string, Rows>;
  isProcessing: boolean;
  lastProcessTime: number | null;
  previewRowLimitMode: PreviewRowLimitMode;
  previewRowCustom: number;
  previewCharLimitMode: PreviewCharLimitMode;
  previewCharCustom: number;
  previewDirection: PreviewDirection;
  layoutDirection: LayoutDirection;
  clipboard: NodeClipboard | null;
  pasteIndex: number;
  isReadingFile: boolean;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onDelete: (params: { nodes: FlowNode[]; edges: Edge[] }) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: OperationKind, position: { x: number; y: number }, edgeId?: string) => string;
  spliceNodeIntoEdge: (nodeId: string, edgeId: string) => void;
  updateNodeParams: (id: string, params: Record<string, unknown>) => void;
  renameNode: (id: string, label: string) => void;
  setNodeNote: (id: string, note: string) => void;
  toggleNodeBypass: (id: string) => void;
  tidyGraph: (direction?: LayoutDirection) => void;
  setLayoutDirection: (direction: LayoutDirection) => void;
  quickAddNode: (kind: OperationKind, position?: { x: number; y: number }) => string;
  fanOutColumns: (
    sourceNodeId: string,
    delimiter?: string,
    quoteAware?: boolean,
    skipHeader?: boolean,
    selectedColumns?: number[]
  ) => string[];
  removeEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setPinnedNode: (id: string | null) => void;
  undo: () => boolean;
  redo: () => boolean;
  copySelected: () => boolean;
  pasteSelected: () => boolean;
  attachInputFile: (id: string, file: File) => void;
  clearInputFile: (id: string) => void;
  resetProject: () => void;
  applyTemplate: (templateId: string) => void;
  setViewport: (viewport: Viewport) => void;
  restoreProject: (project: ProjectSnapshot) => void;
  connectMagnetically: (
    draggedId: string,
    hoveredId: string,
    draggedX: number,
    hoveredHandle: string | null,
    draggedHandle: string | null
  ) => boolean;
  setPreviewRowLimit: (mode: PreviewRowLimitMode, custom?: number) => void;
  setPreviewCharLimit: (mode: PreviewCharLimitMode, custom?: number) => void;
  setPreviewDirection: (direction: PreviewDirection) => void;
  processFullGraph: () => void;
  recompute: () => void;
}

const initialStarter = createStarterGraph();

export const useGraphStore = create<GraphState>((set, get) => {
  function recordHistory(coalesceKey?: string) {
    const now = performance.now();
    if (coalesceKey && lastCommitMeta.key === coalesceKey && now - lastCommitMeta.time < 750) {
      lastCommitMeta.time = now;
      return;
    }
    lastCommitMeta = { key: coalesceKey ?? "", time: coalesceKey ? now : 0 };
    const snap = cloneHistorySnapshot(get());
    const nextPast = [...get().past, snap];
    if (nextPast.length > MAX_HISTORY) nextPast.shift();
    set({ past: nextPast, future: [] });
  }

  return {
    nodes: initialStarter.nodes,
    edges: initialStarter.edges,
    selectedNodeId: null,
    pinnedNodeId: null,
    past: [],
    future: [],
    viewport: null,
    outputs: evaluateGraph(initialStarter.nodes, initialStarter.edges, {
      rowLimit: 10,
      charLimit: 500,
      direction: "head",
      inputRowsById: previewRows,
    }),
    fullOutputs: new Map(),
    isProcessing: false,
    lastProcessTime: null,
    previewRowLimitMode: "10",
    previewRowCustom: 50,
    previewCharLimitMode: "500",
    previewCharCustom: 1000,
    previewDirection: "head",
    layoutDirection: "horizontal",
    clipboard: null,
    pasteIndex: 0,
    isReadingFile: false,

    onNodesChange: (changes) => {
      if (changes.some((c) => c.type === "remove")) {
        recordHistory("delete-nodes");
      } else if (changes.some((c) => c.type === "position" && c.dragging === true)) {
        recordHistory("drag-nodes");
      }
      for (const change of changes) {
        if (change.type === "remove") {
          forgetInputFile(change.id);
          previewRows.delete(change.id);
          if (get().pinnedNodeId === change.id) {
            set({ pinnedNodeId: null });
          }
        }
      }
      set({ nodes: applyNodeChanges(changes, get().nodes) });
      get().recompute();
    },
    onEdgesChange: (changes) => {
      if (changes.some((c) => c.type === "remove")) {
        recordHistory("delete-edges");
      }
      set({ edges: applyEdgeChanges(changes, get().edges) });
      get().recompute();
    },
    onDelete: ({ nodes: deletedNodes, edges: deletedEdges }) => {
      if (deletedNodes.length === 0) return;
      const bridged = bridgeDeletedNodes(get().nodes, get().edges, deletedNodes, deletedEdges);
      if (bridged !== get().edges) {
        set({ edges: bridged });
        get().recompute();
      }
    },
    onConnect: (connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      recordHistory();
      const nodes = get().nodes;
      const sourceKind = nodes.find((node) => node.id === connection.source)?.data.kind;
      const sourceHandle = normalizeOutputSlot(sourceKind, connection.sourceHandle);
      const targetKind = nodes.find((node) => node.id === connection.target)?.data.kind;
      const targetHandle = normalizeInputSlot(targetKind, connection.targetHandle);
      const filtered = replaceTargetInputEdge(get().edges, nodes, connection.target, targetHandle);
      set({
        edges: addEdge(
          {
            ...connection,
            sourceHandle,
            targetHandle,
          },
          filtered
        ),
      });
      get().recompute();
    },
    addNode: (kind, position, edgeId) => {
      recordHistory("add-node");
      const id = nanoid(6);
      const node: FlowNode = {
        id,
        type: kind,
        position,
        data: { kind, label: OPERATION_LABELS[kind], params: defaultParams(kind) },
      };
      const nextNodes = [...get().nodes, node];
      set({ nodes: nextNodes });

      const splicedEdge = edgeId ? get().edges.find((edge) => edge.id === edgeId) : undefined;
      if (splicedEdge) {
        let edges = get().edges.filter((edge) => edge.id !== edgeId);
        if (kind !== "input") {
          const sourceKind = nextNodes.find((n) => n.id === splicedEdge.source)?.data.kind;
          edges = addEdge(
            {
              source: splicedEdge.source,
              target: id,
              sourceHandle: normalizeOutputSlot(sourceKind, splicedEdge.sourceHandle),
              targetHandle: normalizeInputSlot(kind, null),
            },
            edges
          );
        }
        if (kind !== "output") {
          const targetKind = nextNodes.find((n) => n.id === splicedEdge.target)?.data.kind;
          const targetHandle = normalizeInputSlot(targetKind, splicedEdge.targetHandle);
          edges = replaceTargetInputEdge(edges, nextNodes, splicedEdge.target, targetHandle);
          edges = addEdge(
            {
              source: id,
              target: splicedEdge.target,
              sourceHandle: normalizeOutputSlot(kind, null),
              targetHandle,
            },
            edges
          );
        }
        set({ edges });
      }

      get().recompute();
      return id;
    },
    spliceNodeIntoEdge: (nodeId, edgeId) => {
      const nodes = get().nodes;
      const node = nodes.find((item) => item.id === nodeId);
      const splicedEdge = get().edges.find((edge) => edge.id === edgeId);
      if (!node || !splicedEdge) return;
      if (splicedEdge.source === nodeId || splicedEdge.target === nodeId) return;
      recordHistory();

      let edges = get().edges.filter((edge) => edge.id !== edgeId);
      if (node.data.kind !== "input") {
        const sourceKind = nodes.find((n) => n.id === splicedEdge.source)?.data.kind;
        const inHandle = normalizeInputSlot(node.data.kind, null);
        edges = replaceTargetInputEdge(edges, nodes, nodeId, inHandle);
        edges = addEdge(
          {
            source: splicedEdge.source,
            target: nodeId,
            sourceHandle: normalizeOutputSlot(sourceKind, splicedEdge.sourceHandle),
            targetHandle: inHandle,
          },
          edges
        );
      }
      if (node.data.kind !== "output") {
        const targetKind = nodes.find((n) => n.id === splicedEdge.target)?.data.kind;
        const targetHandle = normalizeInputSlot(targetKind, splicedEdge.targetHandle);
        edges = replaceTargetInputEdge(edges, nodes, splicedEdge.target, targetHandle);
        edges = addEdge(
          {
            source: nodeId,
            target: splicedEdge.target,
            sourceHandle: normalizeOutputSlot(node.data.kind, null),
            targetHandle,
          },
          edges
        );
      }
      set({ edges });
      get().recompute();
    },
    updateNodeParams: (id, params) => {
      recordHistory(`params:${id}`);
      set({
        nodes: get().nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, params: { ...node.data.params, ...params } as NodeData["params"] } }
            : node
        ),
      });
      const node = get().nodes.find((item) => item.id === id);
      if (node && isFileInput(node)) void refreshFilePreviews();
      else get().recompute();
    },
    renameNode: (id, label) => {
      recordHistory(`rename:${id}`);
      set({
        nodes: get().nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, label } } : node)),
      });
    },
    setNodeNote: (id, note) => {
      recordHistory(`note:${id}`);
      set({
        nodes: get().nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, note } } : node)),
      });
    },
    toggleNodeBypass: (id) => {
      recordHistory();
      set({
        nodes: get().nodes.map((node) =>
          node.id === id && node.data.kind !== "input" && node.data.kind !== "output"
            ? { ...node, data: { ...node.data, bypassed: !node.data.bypassed } }
            : node
        ),
      });
      get().recompute();
    },
    tidyGraph: (direction) => {
      recordHistory();
      const dir = direction ?? get().layoutDirection;
      set({
        layoutDirection: dir,
        nodes: layoutGraphTopologically(get().nodes, get().edges, dir),
      });
    },
    setLayoutDirection: (direction) => {
      recordHistory();
      set({
        layoutDirection: direction,
        nodes: layoutGraphTopologically(get().nodes, get().edges, direction),
      });
    },
    quickAddNode: (kind, fallbackPosition) => {
      recordHistory("add-node");
      const state = get();
    const isVertical = state.layoutDirection === "vertical";
    const selected = state.selectedNodeId
      ? state.nodes.find((n) => n.id === state.selectedNodeId)
      : undefined;

    function avoidOverlap(pos: { x: number; y: number }, existing: FlowNode[]): { x: number; y: number } {
      let candidate = { ...pos };
      while (
        existing.some(
          (n) => Math.abs(n.position.x - candidate.x) < 60 && Math.abs(n.position.y - candidate.y) < 55
        )
      ) {
        candidate = isVertical
          ? { x: candidate.x + 210, y: candidate.y }
          : { x: candidate.x, y: candidate.y + 110 };
      }
      return candidate;
    }

    if (selected && selected.data.kind !== "output" && kind !== "input") {
      const outgoing = state.edges.filter((e) => e.source === selected.id);
      const singleOutEdge = outgoing.length === 1 && kind !== "output" ? outgoing[0] : undefined;
      const basePos = avoidOverlap(
        isVertical
          ? { x: selected.position.x, y: selected.position.y + 155 }
          : { x: selected.position.x + 250, y: selected.position.y },
        state.nodes
      );

      if (singleOutEdge) {
        const targetNode = state.nodes.find((n) => n.id === singleOutEdge.target);
        if (isVertical) {
          if (targetNode && targetNode.position.y < basePos.y + 110) {
            const shiftY = basePos.y + 155 - targetNode.position.y;
            set({
              nodes: state.nodes.map((n) =>
                n.position.y >= targetNode.position.y - 10
                  ? { ...n, position: { x: n.position.x, y: n.position.y + shiftY } }
                  : n
              ),
            });
          }
        } else if (targetNode && targetNode.position.x < basePos.x + 180) {
          const shiftX = basePos.x + 250 - targetNode.position.x;
          set({
            nodes: state.nodes.map((n) =>
              n.position.x >= targetNode.position.x - 10
                ? { ...n, position: { x: n.position.x + shiftX, y: n.position.y } }
                : n
            ),
          });
        }
        const newId = get().addNode(kind, basePos, singleOutEdge.id);
        set({
          nodes: get().nodes.map((n) => ({ ...n, selected: n.id === newId })),
          selectedNodeId: newId,
        });
        return newId;
      }

      const newId = get().addNode(kind, basePos);
      const sourceHandle = normalizeOutputSlot(selected.data.kind, null);
      const targetHandle = normalizeInputSlot(kind, null);
      const filtered = replaceTargetInputEdge(get().edges, get().nodes, newId, targetHandle);
      set({
        edges: addEdge(
          { source: selected.id, target: newId, sourceHandle, targetHandle },
          filtered
        ),
        nodes: get().nodes.map((n) => ({ ...n, selected: n.id === newId })),
        selectedNodeId: newId,
      });
      get().recompute();
      return newId;
    }

    if (selected && selected.data.kind === "output" && kind !== "input" && kind !== "output") {
      const incoming = state.edges.filter((e) => e.target === selected.id);
      if (incoming.length === 1) {
        const inEdge = incoming[0];
        const sourceNode = state.nodes.find((n) => n.id === inEdge.source);
        const basePos = avoidOverlap(
          isVertical
            ? {
                x: selected.position.x,
                y: sourceNode ? sourceNode.position.y + 155 : selected.position.y - 155,
              }
            : {
                x: sourceNode ? sourceNode.position.x + 250 : selected.position.x - 250,
                y: selected.position.y,
              },
          state.nodes
        );
        if (isVertical) {
          if (selected.position.y < basePos.y + 110) {
            set({
              nodes: state.nodes.map((n) =>
                n.id === selected.id ? { ...n, position: { x: n.position.x, y: basePos.y + 155 } } : n
              ),
            });
          }
        } else if (selected.position.x < basePos.x + 180) {
          set({
            nodes: state.nodes.map((n) =>
              n.id === selected.id ? { ...n, position: { x: basePos.x + 250, y: n.position.y } } : n
            ),
          });
        }
        const newId = get().addNode(kind, basePos, inEdge.id);
        set({
          nodes: get().nodes.map((n) => ({ ...n, selected: n.id === newId })),
          selectedNodeId: newId,
        });
        return newId;
      }
    }

    const defaultPos = avoidOverlap(
      fallbackPosition ?? { x: 220, y: 180 },
      state.nodes
    );
    const newId = get().addNode(kind, defaultPos);
    set({
      nodes: get().nodes.map((n) => ({ ...n, selected: n.id === newId })),
      selectedNodeId: newId,
    });
    return newId;
  },
    fanOutColumns: (
      sourceNodeId,
      delimiter = ",",
      quoteAware = true,
      skipHeader = true,
      selectedColumns
    ) => {
      const state = get();
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode || sourceNode.data.kind === "output") return [];
      const rows = state.outputs.get(sourceNodeId) ?? [];
      const firstRow = rows.find((r) => r.trim().length > 0) ?? "";
      const cols = parseCsvColumns(firstRow, delimiter, quoteAware).slice(0, 12);
      if (cols.length <= 1) return [];
      const targetCols =
        selectedColumns && selectedColumns.length > 0
          ? selectedColumns.filter((c) => c >= 1 && c <= cols.length)
          : cols.map((_, idx) => idx + 1);
      if (targetCols.length === 0) return [];
      recordHistory();

      const isVertical = state.layoutDirection === "vertical";
      const sourceHandle = normalizeOutputSlot(sourceNode.data.kind, null);
      const createdNodes: FlowNode[] = [];
      let nextEdges = [...state.edges];
      const createdIds: string[] = [];

      const startY = sourceNode.position.y - ((targetCols.length - 1) * 125) / 2;
      const startX = sourceNode.position.x - ((targetCols.length - 1) * 230) / 2;

      targetCols.forEach((colNum, idx) => {
        const rawHeader = cols[colNum - 1] ?? "";
        const cleanHeader = rawHeader.replace(/[\r\n]+/g, " ").trim();
        const shortHeader = cleanHeader.length > 18 ? `${cleanHeader.slice(0, 18)}…` : cleanHeader;
        const label = shortHeader ? `Col ${colNum}: ${shortHeader}` : `Column ${colNum}`;
        const note =
          skipHeader && shortHeader
            ? `CSV col #${colNum} ("${shortHeader}", skips header)`
            : `CSV col #${colNum}`;
        const id = nanoid(6);
        createdIds.push(id);
        const position = isVertical
          ? { x: Math.round(startX + idx * 230), y: sourceNode.position.y + 165 }
          : { x: sourceNode.position.x + 260, y: Math.round(startY + idx * 125) };

        createdNodes.push({
          id,
          type: "extract",
          position,
          selected: idx === 0,
          data: {
            kind: "extract",
            label,
            note,
            params: {
              ...defaultParams("extract"),
              mode: "column",
              delimiter,
              column: colNum,
              quoteAware,
              skipHeader,
              trimValues: true,
            },
          },
        });

        nextEdges = addEdge(
          {
            source: sourceNode.id,
            target: id,
            sourceHandle,
            targetHandle: null,
          },
          nextEdges
        );
      });

      set({
        nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), ...createdNodes],
        edges: nextEdges,
        selectedNodeId: createdIds[0] ?? state.selectedNodeId,
      });
      get().recompute();
      return createdIds;
    },
    removeEdge: (id) => {
      recordHistory();
      set({ edges: get().edges.filter((edge) => edge.id !== id) });
      get().recompute();
    },
    setSelectedNode: (id) => set({ selectedNodeId: id }),
    setPinnedNode: (id) => set({ pinnedNodeId: id }),
    undo: () => {
      const state = get();
      if (state.past.length === 0) return false;
      const previous = state.past[state.past.length - 1];
      const currentSnapshot = cloneHistorySnapshot(state);
      lastCommitMeta = { key: "", time: 0 };
      set({
        nodes: previous.nodes,
        edges: previous.edges,
        selectedNodeId: previous.selectedNodeId,
        layoutDirection: previous.layoutDirection,
        past: state.past.slice(0, -1),
        future: [currentSnapshot, ...state.future].slice(0, MAX_HISTORY),
      });
      if (hasFileInput(previous.nodes)) void refreshFilePreviews();
      else get().recompute();
      return true;
    },
    redo: () => {
      const state = get();
      if (state.future.length === 0) return false;
      const next = state.future[0];
      const currentSnapshot = cloneHistorySnapshot(state);
      lastCommitMeta = { key: "", time: 0 };
      set({
        nodes: next.nodes,
        edges: next.edges,
        selectedNodeId: next.selectedNodeId,
        layoutDirection: next.layoutDirection,
        past: [...state.past, currentSnapshot].slice(-MAX_HISTORY),
        future: state.future.slice(1),
      });
      if (hasFileInput(next.nodes)) void refreshFilePreviews();
      else get().recompute();
      return true;
    },
    copySelected: () => {
      const snapshot = snapshotSelection(get().nodes, get().edges, get().selectedNodeId);
      if (!snapshot) return false;
      set({ clipboard: snapshot, pasteIndex: 0 });
      return true;
    },
    pasteSelected: () => {
      const clipboard = get().clipboard;
      if (!clipboard || clipboard.nodes.length === 0) return false;
      recordHistory();

      const pasted = pasteClipboard(clipboard, get().pasteIndex, () => nanoid(6));
      let copiedFile = false;
      for (const [oldId, newId] of pasted.idMap) {
        if (getInputFile(oldId)) {
          copyInputFile(oldId, newId);
          copiedFile = true;
        }
      }
      set({
        nodes: [...get().nodes.map((node) => ({ ...node, selected: false })), ...pasted.nodes],
        edges: [...get().edges.map((edge) => ({ ...edge, selected: false })), ...pasted.edges],
        pasteIndex: get().pasteIndex + 1,
        selectedNodeId: pasted.nodes[0]?.id ?? null,
      });
      if (copiedFile) void refreshFilePreviews();
      else get().recompute();
      return true;
    },
    attachInputFile: (id, file) => {
      recordHistory();
      setInputFile(id, file);
      previewRows.delete(id);
      set({
        nodes: get().nodes.map((node) =>
          node.id === id && node.data.kind === "input"
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: {
                    ...(node.data.params as OperationParams["input"]),
                    source: "file",
                    fileName: file.name,
                    fileSize: file.size,
                  },
                },
              }
            : node
        ),
      });
      void refreshFilePreviews();
    },
    clearInputFile: (id) => {
      recordHistory();
      forgetInputFile(id);
      previewRows.delete(id);
      set({
        nodes: get().nodes.map((node) =>
          node.id === id && node.data.kind === "input"
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: {
                    ...(node.data.params as OperationParams["input"]),
                    source: "text",
                    fileName: "",
                    fileSize: 0,
                  },
                },
              }
            : node
        ),
      });
      get().recompute();
    },
    resetProject: () => {
      replaceInputFiles([]);
      previewRows.clear();
      lastCommitMeta = { key: "", time: 0 };
      const starter = createStarterGraph();
      const dir = get().layoutDirection;
      const starterNodes =
        dir === "vertical"
          ? layoutGraphTopologically(starter.nodes, starter.edges, "vertical")
          : starter.nodes;
      set({
        nodes: starterNodes,
        edges: starter.edges,
        selectedNodeId: null,
        pinnedNodeId: null,
        past: [],
        future: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        outputs: new Map(),
        fullOutputs: new Map(),
        lastProcessTime: null,
        isProcessing: false,
        isReadingFile: false,
        previewRowLimitMode: "10",
        previewRowCustom: 50,
        previewCharLimitMode: "500",
        previewCharCustom: 1000,
        clipboard: null,
        pasteIndex: 0,
      });
      get().recompute();
    },
    applyTemplate: (templateId) => {
      const template = GRAPH_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return;
      replaceInputFiles([]);
      previewRows.clear();
      lastCommitMeta = { key: "", time: 0 };
      const { nodes: rawNodes, edges } = template.createGraph();
      const dir = get().layoutDirection;
      const nodes =
        dir === "vertical"
          ? layoutGraphTopologically(rawNodes, edges, "vertical")
          : rawNodes;
      const outputNode = nodes.find((node) => node.data.kind === "output");
      set({
        nodes,
        edges,
        selectedNodeId: outputNode?.id ?? nodes[0]?.id ?? null,
        pinnedNodeId: null,
        past: [],
        future: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        fullOutputs: new Map(),
        lastProcessTime: null,
        isProcessing: false,
        isReadingFile: false,
      });
      get().recompute();
    },
    setViewport: (viewport) => {
      const previous = get().viewport;
      if (previous && previous.x === viewport.x && previous.y === viewport.y && previous.zoom === viewport.zoom) return;
      set({ viewport });
    },
    restoreProject: (project) => {
      replaceInputFiles(
        project.files.map(({ nodeId, name, type, blob }) => ({
          nodeId,
          file: new File([blob], name, { type }),
        }))
      );
      previewRows.clear();
      lastCommitMeta = { key: "", time: 0 };
      const nodes = project.nodes.map((node) => ({ ...node, selected: false, dragging: false }));
      set({
        nodes,
        edges: project.edges,
        viewport: project.viewport,
        selectedNodeId: null,
        pinnedNodeId: null,
        past: [],
        future: [],
        previewRowLimitMode: project.preview.rowMode,
        previewRowCustom: project.preview.rowCustom,
        previewCharLimitMode: project.preview.charMode,
        previewCharCustom: project.preview.charCustom,
        fullOutputs: new Map(),
        lastProcessTime: null,
      });
      if (hasFileInput(nodes)) void refreshFilePreviews();
      else get().recompute();
    },
    connectMagnetically: (draggedId, hoveredId, draggedX, hoveredHandle, draggedHandle) => {
      const nodes = get().nodes;
      const dragged = nodes.find((node) => node.id === draggedId);
      const hovered = nodes.find((node) => node.id === hoveredId);
      if (!dragged || !hovered) return false;
      const link = planMagneticConnection(
        { id: dragged.id, kind: dragged.data.kind, x: draggedX, y: dragged.position.y },
        { id: hovered.id, kind: hovered.data.kind, x: hovered.position.x, y: hovered.position.y },
        get().edges,
        hoveredHandle,
        draggedHandle
      );
      if (!link) return false;
      const sourceKind = nodes.find((node) => node.id === link.source)?.data.kind;
      const sourceHandle = normalizeOutputSlot(sourceKind, link.sourceHandle);
      const targetKind = nodes.find((node) => node.id === link.target)?.data.kind;
      const targetHandle = normalizeInputSlot(targetKind, link.targetHandle);
      const exists = get().edges.some(
        (edge) =>
          edge.source === link.source &&
          edge.target === link.target &&
          normalizeOutputSlot(sourceKind, edge.sourceHandle) === sourceHandle &&
          normalizeInputSlot(targetKind, edge.targetHandle) === targetHandle
      );
      if (exists) return true;
      recordHistory();
      const filtered = replaceTargetInputEdge(get().edges, nodes, link.target, targetHandle);
      set({
        edges: addEdge(
          { source: link.source, target: link.target, sourceHandle, targetHandle },
          filtered
        ),
      });
      get().recompute();
      return true;
    },
    setPreviewRowLimit: (mode, custom) => {
      set({
        previewRowLimitMode: mode,
        ...(custom !== undefined ? { previewRowCustom: custom } : {}),
      });
      if (hasFileInput(get().nodes)) void refreshFilePreviews();
      else get().recompute();
    },
    setPreviewCharLimit: (mode, custom) => {
      set({
        previewCharLimitMode: mode,
        ...(custom !== undefined ? { previewCharCustom: custom } : {}),
      });
      if (hasFileInput(get().nodes)) void refreshFilePreviews();
      else get().recompute();
    },
    setPreviewDirection: (direction) => {
      set({ previewDirection: direction });
      if (hasFileInput(get().nodes)) void refreshFilePreviews();
      else get().recompute();
    },
    processFullGraph: () => {
      void runFullProcess();
    },
    recompute: () => {
      const rowLimit = getRowLimit(get().previewRowLimitMode, get().previewRowCustom);
      const charLimit = getCharLimit(get().previewCharLimitMode, get().previewCharCustom);
      const direction = get().previewDirection;
      const outputs = evaluateGraph(get().nodes, get().edges, {
        rowLimit,
        charLimit,
        direction,
        inputRowsById: previewRows,
      });
      set({ outputs });
    },
  };
});

async function refreshFilePreviews(): Promise<void> {
  const token = ++previewToken;
  const get = useGraphStore.getState;
  const nodes = get().nodes.filter(isFileInput);
  if (nodes.length === 0) {
    previewRows.clear();
    get().recompute();
    return;
  }
  useGraphStore.setState({ isReadingFile: true });
  const rowLimit = getRowLimit(get().previewRowLimitMode, get().previewRowCustom);
  const charLimit = getCharLimit(get().previewCharLimitMode, get().previewCharCustom);
  const direction = get().previewDirection;
  const next = new Map<string, Rows>();
  await Promise.all(
    nodes.map(async (node) => {
      const file = getInputFile(node.id);
      const params = node.data.params as OperationParams["input"];
      if (!file) return;
      const text = await readPreviewText(file, params, rowLimit, charLimit, direction);
      let rows = splitInputText(text, params, rowLimit, direction);
      if (rowLimit && rows.length > rowLimit) {
        rows = direction === "tail" ? rows.slice(-rowLimit) : rows.slice(0, rowLimit);
      }
      if (params.inputType === "single" && charLimit && rows[0] && rows[0].length > charLimit) {
        rows = [direction === "tail" ? rows[0].slice(-charLimit) : rows[0].slice(0, charLimit)];
      }
      next.set(node.id, rows);
    })
  );
  if (token !== previewToken) return;
  previewRows.clear();
  for (const [id, rows] of next) previewRows.set(id, rows);
  useGraphStore.setState({ isReadingFile: false });
  get().recompute();
}

async function runFullProcess(): Promise<void> {
  const get = useGraphStore.getState;
  useGraphStore.setState({ isProcessing: true });
  const start = performance.now();
  const inputRowsById = new Map<string, Rows>();
  for (const node of get().nodes) {
    if (!isFileInput(node)) continue;
    const file = getInputFile(node.id);
    if (!file) continue;
    inputRowsById.set(node.id, await readFileRows(file, node.data.params as OperationParams["input"]));
  }
  const fullOutputs = evaluateGraph(get().nodes, get().edges, { inputRowsById });
  useGraphStore.setState({
    fullOutputs,
    isProcessing: false,
    lastProcessTime: Math.round((performance.now() - start) * 10) / 10,
  });
}
