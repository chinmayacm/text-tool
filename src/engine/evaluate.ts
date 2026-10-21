import type { Edge, Node } from "@xyflow/react";
import { isDualInputKind, isDualOutputKind, type NodeData, type OperationKind, type OperationParams, type Rows } from "../types.ts";
import { runOperation, runPartitionOperation, runUnmergeOperation, type EvaluateOptions } from "./operations.ts";

export type InputRowsById = Map<string, Rows>;

type FlowNode = Node<NodeData<OperationKind>>;

interface IncomingEdge {
  source: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

/** Computes the output rows for every node in the graph, respecting edge order (topological). */
export function evaluateGraph(
  nodes: FlowNode[],
  edges: Edge[],
  options?: EvaluateOptions & { inputRowsById?: InputRowsById }
): Map<string, Rows> {
  const outputs = new Map<string, Rows>();
  const incoming = new Map<string, IncomingEdge[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of edges) {
    if (!incoming.has(edge.target)) continue;
    incoming.get(edge.target)!.push({
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    });
  }

  const visiting = new Set<string>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function resolveEdge(edge: IncomingEdge | undefined): Rows {
    if (!edge) return [];
    const primary = resolve(edge.source);
    const sourceNode = nodeById.get(edge.source);
    if (isDualOutputKind(sourceNode?.data.kind) && edge.sourceHandle === "b") {
      return outputs.get(`${edge.source}:b`) ?? [];
    }
    return primary;
  }

  function resolve(id: string): Rows {
    if (outputs.has(id)) return outputs.get(id)!;
    if (visiting.has(id)) return [];
    visiting.add(id);

    const node = nodeById.get(id);
    if (!node) return [];

    const inc = incoming.get(id) ?? [];
    let result: Rows = [];

    if (node.data.bypassed && node.data.kind !== "input" && node.data.kind !== "output") {
      if (isDualInputKind(node.data.kind)) {
        const edgeA = inc.find((e) => e.targetHandle === "a") || inc[0];
        result = resolveEdge(edgeA);
      } else if (isDualOutputKind(node.data.kind)) {
        const input = inc.length > 0 ? resolveEdge(inc[0]) : [];
        outputs.set(`${id}:a`, input);
        outputs.set(`${id}:b`, input);
        result = input;
      } else {
        result = inc.length > 0 ? resolveEdge(inc[0]) : [];
      }
      outputs.set(id, result);
      visiting.delete(id);
      return result;
    }

    if (isDualInputKind(node.data.kind)) {
      const edgeA = inc.find((e) => e.targetHandle === "a") || inc[0];
      const edgeB = inc.find((e) => e.targetHandle === "b") || (inc[0] === edgeA ? inc[1] : inc[0]);
      const inputA = resolveEdge(edgeA);
      const inputB = resolveEdge(edgeB);
      result = runOperation(node.data, inputA, optionsFor(node, options), inputB);
    } else if (node.data.kind === "unmerge") {
      const input = inc.length > 0 ? resolveEdge(inc[0]) : [];
      const { a, b } = runUnmergeOperation(
        node.data.params as OperationParams["unmerge"],
        input,
        optionsFor(node, options)
      );
      outputs.set(`${id}:a`, a);
      outputs.set(`${id}:b`, b);
      result = a;
    } else if (node.data.kind === "partition") {
      const input = inc.length > 0 ? resolveEdge(inc[0]) : [];
      const { a, b } = runPartitionOperation(
        node.data.params as OperationParams["partition"],
        input,
        optionsFor(node, options)
      );
      outputs.set(`${id}:a`, a);
      outputs.set(`${id}:b`, b);
      result = a;
    } else {
      const input = inc.length > 0 ? resolveEdge(inc[0]) : [];
      result = runOperation(node.data, input, optionsFor(node, options));
    }

    outputs.set(id, result);
    visiting.delete(id);
    return result;
  }

  for (const node of nodes) resolve(node.id);
  return outputs;
}

function optionsFor(
  node: FlowNode,
  options?: EvaluateOptions & { inputRowsById?: InputRowsById }
): EvaluateOptions | undefined {
  if (node.data.kind !== "input") return options;
  const params = node.data.params as OperationParams["input"];
  if (params.source !== "file") return options;
  return { ...options, fileRows: options?.inputRowsById?.get(node.id) ?? [] };
}
