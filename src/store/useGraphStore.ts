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
import { defaultParams, OPERATION_LABELS, type NodeData, type OperationKind, type OperationParams, type Rows } from "../types";
import { readFileRows, readPreviewText, splitInputText } from "../engine/textSource";
import { evaluateGraph } from "../engine/evaluate";
import { pasteClipboard, snapshotSelection, type NodeClipboard } from "./clipboard";
import { copyInputFile, forgetInputFile, getInputFile, replaceInputFiles, setInputFile } from "./inputFiles";
import { planMagneticConnection } from "./magnet";
import type { ProjectSnapshot } from "./projectPersistence";
import { createStarterGraph, GRAPH_TEMPLATES } from "../templates";

export type FlowNode = Node<NodeData<OperationKind>>;

export type PreviewRowLimitMode = "5" | "10" | "50" | "custom" | "all";
export type PreviewCharLimitMode = "100" | "500" | "1000" | "custom" | "all";

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

export function bridgeDeletedNodes(
  remainingNodes: Pick<FlowNode, "id">[],
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

  function findSurvivingSource(startNodeId: string): string | null {
    const visited = new Set<string>();
    const queue = [startNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const incoming = incomingByTarget.get(current) ?? [];
      for (const edge of incoming) {
        if (survivingIds.has(edge.source)) return edge.source;
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
    const targetHandle = outEdge.targetHandle ?? null;
    const handleOccupied = nextEdges.some(
      (edge) => edge.target === outEdge.target && (edge.targetHandle ?? null) === targetHandle
    );
    if (handleOccupied) continue;

    const sourceId = findSurvivingSource(outEdge.source);
    if (!sourceId || sourceId === outEdge.target) continue;

    nextEdges = addEdge(
      {
        source: sourceId,
        target: outEdge.target,
        sourceHandle: null,
        targetHandle,
      },
      nextEdges
    );
  }

  return nextEdges;
}

interface GraphState {
  nodes: FlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  viewport: Viewport | null;
  outputs: Map<string, Rows>;
  fullOutputs: Map<string, Rows>;
  isProcessing: boolean;
  lastProcessTime: number | null;
  previewRowLimitMode: PreviewRowLimitMode;
  previewRowCustom: number;
  previewCharLimitMode: PreviewCharLimitMode;
  previewCharCustom: number;
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
  removeEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
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
  processFullGraph: () => void;
  recompute: () => void;
}

const initialStarter = createStarterGraph();

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: initialStarter.nodes,
  edges: initialStarter.edges,
  selectedNodeId: null,
  viewport: null,
  outputs: evaluateGraph(initialStarter.nodes, initialStarter.edges, {
    rowLimit: 10,
    charLimit: 500,
    inputRowsById: previewRows,
  }),
  fullOutputs: new Map(),
  isProcessing: false,
  lastProcessTime: null,
  previewRowLimitMode: "10",
  previewRowCustom: 50,
  previewCharLimitMode: "500",
  previewCharCustom: 1000,
  clipboard: null,
  pasteIndex: 0,
  isReadingFile: false,

  onNodesChange: (changes) => {
    for (const change of changes) {
      if (change.type === "remove") {
        forgetInputFile(change.id);
        previewRows.delete(change.id);
      }
    }
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    get().recompute();
  },
  onEdgesChange: (changes) => {
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
    const filtered = get().edges.filter(
      (edge) => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle)
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

    const splicedEdge = edgeId ? get().edges.find((edge) => edge.id === edgeId) : undefined;
    if (splicedEdge) {
      let edges = get().edges.filter((edge) => edge.id !== edgeId);
      if (kind !== "input") {
        edges = addEdge({ source: splicedEdge.source, target: id, sourceHandle: null, targetHandle: null }, edges);
      }
      if (kind !== "output") {
        edges = addEdge({ source: id, target: splicedEdge.target, sourceHandle: null, targetHandle: null }, edges);
      }
      set({ edges });
    }

    get().recompute();
    return id;
  },
  spliceNodeIntoEdge: (nodeId, edgeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);
    const splicedEdge = get().edges.find((edge) => edge.id === edgeId);
    if (!node || !splicedEdge) return;
    if (splicedEdge.source === nodeId || splicedEdge.target === nodeId) return;

    let edges = get().edges.filter((edge) => edge.id !== edgeId);
    if (node.data.kind !== "input") {
      edges = edges.filter((edge) => edge.target !== nodeId);
      edges = addEdge({ source: splicedEdge.source, target: nodeId, sourceHandle: null, targetHandle: null }, edges);
    }
    if (node.data.kind !== "output") {
      edges = edges.filter((edge) => edge.target !== splicedEdge.target);
      edges = addEdge({ source: nodeId, target: splicedEdge.target, sourceHandle: null, targetHandle: null }, edges);
    }
    set({ edges });
    get().recompute();
  },
  updateNodeParams: (id, params) => {
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
    set({
      nodes: get().nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, label } } : node)),
    });
  },
  removeEdge: (id) => {
    set({ edges: get().edges.filter((edge) => edge.id !== id) });
    get().recompute();
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  copySelected: () => {
    const snapshot = snapshotSelection(get().nodes, get().edges, get().selectedNodeId);
    if (!snapshot) return false;
    set({ clipboard: snapshot, pasteIndex: 0 });
    return true;
  },
  pasteSelected: () => {
    const clipboard = get().clipboard;
    if (!clipboard || clipboard.nodes.length === 0) return false;

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
    const starter = createStarterGraph();
    set({
      nodes: starter.nodes,
      edges: starter.edges,
      selectedNodeId: null,
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
    const { nodes, edges } = template.createGraph();
    const outputNode = nodes.find((node) => node.data.kind === "output");
    set({
      nodes,
      edges,
      selectedNodeId: outputNode?.id ?? nodes[0]?.id ?? null,
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
    const nodes = project.nodes.map((node) => ({ ...node, selected: false, dragging: false }));
    set({
      nodes,
      edges: project.edges,
      viewport: project.viewport,
      selectedNodeId: null,
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
    const dragged = get().nodes.find((node) => node.id === draggedId);
    const hovered = get().nodes.find((node) => node.id === hoveredId);
    if (!dragged || !hovered) return false;
    const link = planMagneticConnection(
      { id: dragged.id, kind: dragged.data.kind, x: draggedX, y: dragged.position.y },
      { id: hovered.id, kind: hovered.data.kind, x: hovered.position.x, y: hovered.position.y },
      get().edges,
      hoveredHandle,
      draggedHandle
    );
    if (!link) return false;
    const exists = get().edges.some(
      (edge) =>
        edge.source === link.source &&
        edge.target === link.target &&
        (edge.targetHandle ?? null) === link.targetHandle
    );
    if (exists) return true;
    const filtered = get().edges.filter(
      (edge) => !(edge.target === link.target && (edge.targetHandle ?? null) === link.targetHandle)
    );
    set({
      edges: addEdge(
        { source: link.source, target: link.target, sourceHandle: null, targetHandle: link.targetHandle },
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
  processFullGraph: () => {
    void runFullProcess();
  },
  recompute: () => {
    const rowLimit = getRowLimit(get().previewRowLimitMode, get().previewRowCustom);
    const charLimit = getCharLimit(get().previewCharLimitMode, get().previewCharCustom);
    const outputs = evaluateGraph(get().nodes, get().edges, {
      rowLimit,
      charLimit,
      inputRowsById: previewRows,
    });
    set({ outputs });
  },
}));

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
  const next = new Map<string, Rows>();
  await Promise.all(
    nodes.map(async (node) => {
      const file = getInputFile(node.id);
      const params = node.data.params as OperationParams["input"];
      if (!file) return;
      const text = await readPreviewText(file, params, rowLimit, charLimit);
      let rows = splitInputText(text, params);
      if (rowLimit && rows.length > rowLimit) rows = rows.slice(0, rowLimit);
      if (params.inputType === "single" && charLimit && rows[0] && rows[0].length > charLimit) {
        rows = [rows[0].slice(0, charLimit)];
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
