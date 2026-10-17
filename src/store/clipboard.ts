import type { Edge } from "@xyflow/react";
import type { FlowNode } from "./useGraphStore";

export const PASTE_OFFSET = 48;

export type NodeClipboard = {
  nodes: FlowNode[];
  edges: Edge[];
};

export function snapshotSelection(nodes: FlowNode[], edges: Edge[], fallbackId: string | null): NodeClipboard | null {
  const selected = nodes.filter((node) => node.selected || node.id === fallbackId);
  if (selected.length === 0) return null;

  const ids = new Set(selected.map((node) => node.id));
  return {
    nodes: selected.map(snapshotNode),
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map(snapshotEdge),
  };
}

export function pasteClipboard(
  clipboard: NodeClipboard,
  pasteIndex: number,
  createId: () => string
): { nodes: FlowNode[]; edges: Edge[]; idMap: Map<string, string> } {
  const offset = PASTE_OFFSET * (pasteIndex + 1);
  const idMap = new Map<string, string>();

  const nodes = clipboard.nodes.map((node) => {
    const id = createId();
    idMap.set(node.id, id);
    return {
      ...snapshotNode(node),
      id,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      selected: true,
    };
  });

  const edges = clipboard.edges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) return [];
    return [
      {
        ...snapshotEdge(edge),
        id: createId(),
        source,
        target,
        selected: false,
      },
    ];
  });

  return { nodes, edges, idMap };
}

function snapshotNode(node: FlowNode): FlowNode {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: {
      kind: node.data.kind,
      label: node.data.label,
      params: structuredClone(node.data.params),
    },
    selected: false,
    dragging: false,
  };
}

function snapshotEdge(edge: Edge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  };
}
