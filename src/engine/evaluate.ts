import type { Edge, Node } from "@xyflow/react";
import type { NodeData, OperationKind, Rows } from "../types";
import { runOperation, type EvaluateOptions } from "./operations";

type FlowNode = Node<NodeData<OperationKind>>;

interface IncomingEdge {
  source: string;
  targetHandle: string | null;
}

/** Computes the output rows for every node in the graph, respecting edge order (topological). */
export function evaluateGraph(
  nodes: FlowNode[],
  edges: Edge[],
  options?: EvaluateOptions
): Map<string, Rows> {
  const outputs = new Map<string, Rows>();
  const incoming = new Map<string, IncomingEdge[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of edges) {
    if (!incoming.has(edge.target)) continue;
    incoming.get(edge.target)!.push({
      source: edge.source,
      targetHandle: edge.targetHandle ?? null,
    });
  }

  const visiting = new Set<string>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function resolve(id: string): Rows {
    if (outputs.has(id)) return outputs.get(id)!;
    if (visiting.has(id)) return []; // cycle guard
    visiting.add(id);

    const node = nodeById.get(id);
    if (!node) return [];

    const inc = incoming.get(id) ?? [];
    let result: Rows = [];

    if (node.data.kind === "merge" || node.data.kind === "append") {
      const edgeA = inc.find((e) => e.targetHandle === "a") || inc[0];
      const edgeB = inc.find((e) => e.targetHandle === "b") || (inc[0] === edgeA ? inc[1] : inc[0]);

      const inputA = edgeA ? resolve(edgeA.source) : [];
      const inputB = edgeB ? resolve(edgeB.source) : [];

      result = runOperation(node.data, inputA, options, inputB);
    } else {
      const input = inc.length > 0 ? resolve(inc[0].source) : [];
      result = runOperation(node.data, input, options);
    }

    outputs.set(id, result);
    visiting.delete(id);
    return result;
  }

  for (const node of nodes) resolve(node.id);
  return outputs;
}
