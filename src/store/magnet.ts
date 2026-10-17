import type { OperationKind } from "../types";

export type MagnetNode = {
  id: string;
  kind: OperationKind;
  x: number;
};

export type MagnetEdge = {
  source: string;
  target: string;
  targetHandle?: string | null;
};

export type MagneticLink = {
  source: string;
  target: string;
  targetHandle: string | null;
};

/** Left node feeds the right node. Returns null when the pair cannot be connected. */
export function planMagneticConnection(
  dragged: MagnetNode,
  hovered: MagnetNode,
  edges: MagnetEdge[],
  hoveredHandle: string | null,
  draggedHandle: string | null
): MagneticLink | null {
  if (dragged.id === hovered.id) return null;
  const source = dragged.x <= hovered.x ? dragged : hovered;
  const dest = source.id === dragged.id ? hovered : dragged;
  if (source.kind === "output" || dest.kind === "input") return null;
  if (reaches(edges, dest.id, source.id)) return null;

  const targetHandle = dest.kind === "merge" || dest.kind === "append"
    ? ((dest.id === hovered.id ? hoveredHandle : draggedHandle) ?? "a")
    : null;
  return { source: source.id, target: dest.id, targetHandle };
}

function reaches(edges: MagnetEdge[], from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === to) return true;
    for (const edge of edges) {
      if (edge.source === id && !seen.has(edge.target)) {
        seen.add(edge.target);
        stack.push(edge.target);
      }
    }
  }
  return false;
}
