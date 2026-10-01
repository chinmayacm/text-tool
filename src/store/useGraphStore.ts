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
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { defaultParams, OPERATION_LABELS, type NodeData, type OperationKind, type Rows } from "../types";
import { evaluateGraph } from "../engine/evaluate";

export type FlowNode = Node<NodeData<OperationKind>>;

export type PreviewRowLimitMode = "5" | "10" | "50" | "custom" | "all";
export type PreviewCharLimitMode = "100" | "500" | "1000" | "custom" | "all";

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

interface GraphState {
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  outputs: Map<string, Rows>;
  fullOutputs: Map<string, Rows>;
  isProcessing: boolean;
  lastProcessTime: number | null;
  previewRowLimitMode: PreviewRowLimitMode;
  previewRowCustom: number;
  previewCharLimitMode: PreviewCharLimitMode;
  previewCharCustom: number;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: OperationKind, position: { x: number; y: number }, edgeId?: string) => void;
  spliceNodeIntoEdge: (nodeId: string, edgeId: string) => void;
  updateNodeParams: (id: string, params: Record<string, unknown>) => void;
  renameNode: (id: string, label: string) => void;
  removeEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setPreviewRowLimit: (mode: PreviewRowLimitMode, custom?: number) => void;
  setPreviewCharLimit: (mode: PreviewCharLimitMode, custom?: number) => void;
  processFullGraph: () => void;
  recompute: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  outputs: new Map(),
  fullOutputs: new Map(),
  isProcessing: false,
  lastProcessTime: null,
  previewRowLimitMode: "10",
  previewRowCustom: 50,
  previewCharLimitMode: "500",
  previewCharCustom: 1000,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    get().recompute();
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get().recompute();
  },
  onConnect: (connection) => {
    // Enforce a single-input pipeline: replace any existing edge into this target handle.
    const filtered = get().edges.filter(
      (e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle)
    );
    set({ edges: addEdge(connection, filtered) });
    get().recompute();
  },
  addNode: (kind, position, edgeId) => {
    const id = nanoid(6);
    const node: FlowNode = {
      id,
      type: kind,
      position,
      data: { kind, label: OPERATION_LABELS[kind], params: defaultParams(kind) },
    };
    set({ nodes: [...get().nodes, node] });

    // Dropped directly on an edge: splice the new node into that connection.
    const splicedEdge = edgeId ? get().edges.find((e) => e.id === edgeId) : undefined;
    if (splicedEdge) {
      let edges = get().edges.filter((e) => e.id !== edgeId);
      if (kind !== "input") {
        edges = addEdge({ source: splicedEdge.source, target: id, sourceHandle: null, targetHandle: null }, edges);
      }
      if (kind !== "output") {
        edges = addEdge({ source: id, target: splicedEdge.target, sourceHandle: null, targetHandle: null }, edges);
      }
      set({ edges });
    }

    get().recompute();
  },
  spliceNodeIntoEdge: (nodeId, edgeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    const splicedEdge = get().edges.find((e) => e.id === edgeId);
    if (!node || !splicedEdge) return;
    if (splicedEdge.source === nodeId || splicedEdge.target === nodeId) return;

    let edges = get().edges.filter((e) => e.id !== edgeId);
    if (node.data.kind !== "input") {
      edges = edges.filter((e) => e.target !== nodeId);
      edges = addEdge({ source: splicedEdge.source, target: nodeId, sourceHandle: null, targetHandle: null }, edges);
    }
    if (node.data.kind !== "output") {
      edges = edges.filter((e) => e.target !== splicedEdge.target);
      edges = addEdge({ source: nodeId, target: splicedEdge.target, sourceHandle: null, targetHandle: null }, edges);
    }
    set({ edges });
    get().recompute();
  },
  updateNodeParams: (id, params) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, params: { ...n.data.params, ...params } as NodeData["params"] } }
          : n
      ),
    });
    get().recompute();
  },
  renameNode: (id, label) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
    });
  },
  removeEdge: (id) => {
    set({ edges: get().edges.filter((e) => e.id !== id) });
    get().recompute();
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setPreviewRowLimit: (mode, custom) => {
    set({
      previewRowLimitMode: mode,
      ...(custom !== undefined ? { previewRowCustom: custom } : {}),
    });
    get().recompute();
  },
  setPreviewCharLimit: (mode, custom) => {
    set({
      previewCharLimitMode: mode,
      ...(custom !== undefined ? { previewCharCustom: custom } : {}),
    });
    get().recompute();
  },
  processFullGraph: () => {
    set({ isProcessing: true });
    const start = performance.now();
    const fullOutputs = evaluateGraph(get().nodes, get().edges);
    const end = performance.now();
    set({
      fullOutputs,
      isProcessing: false,
      lastProcessTime: Math.round((end - start) * 10) / 10,
    });
  },
  recompute: () => {
    const rowLimit = getRowLimit(get().previewRowLimitMode, get().previewRowCustom);
    const charLimit = getCharLimit(get().previewCharLimitMode, get().previewCharCustom);
    const outputs = evaluateGraph(get().nodes, get().edges, { rowLimit, charLimit });
    set({ outputs });
  },
}));
