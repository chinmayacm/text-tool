import { useEffect, type CSSProperties } from "react";
import { Handle, Position, useUpdateNodeInternals, type Edge, type NodeProps } from "@xyflow/react";
import { isDualInputKind, isDualOutputKind, summarizeNode, type NodeData, type OperationKind } from "../../types";
import { useGraphStore, type FlowNode } from "../../store/useGraphStore";
import "./OperationNode.css";

type Props = NodeProps & { data: NodeData<OperationKind> };

const NODE_WIDTH = 180;
const NODE_HEIGHT = 68;
const VERTICAL_BIAS = 1.4;

type HandleId = "target" | "a" | "b" | "source";

type HandlePlacement = {
  id: HandleId;
  side: Position;
  offset: string; // e.g. "" (default), "32%", "68%", "48px", "70px"
};

function nodeCenter(node: FlowNode): { x: number; y: number } {
  const w = node.measured?.width ?? NODE_WIDTH;
  const h = node.measured?.height ?? NODE_HEIGHT;
  return {
    x: node.position.x + w / 2,
    y: node.position.y + h / 2,
  };
}

/**
 * Snaps a direction vector (dx, dy) from a node to its neighbor onto one of the 4 sides.
 * Uses aspect-ratio bias (~35°..145° for top/bottom) so wide nodes snap vertically as soon as
 * a neighbor is visually above or below them.
 */
function snapVectorToSide(dx: number, dy: number): Position {
  if (Math.abs(dy) * VERTICAL_BIAS >= Math.abs(dx)) {
    return dy >= 0 ? Position.Bottom : Position.Top;
  }
  return dx >= 0 ? Position.Right : Position.Left;
}

function computeHandleLayoutKey(nodeId: string, kind: OperationKind, nodes: FlowNode[], edges: Edge[]): string {
  const self = nodes.find((n) => n.id === nodeId);
  if (!self) {
    return `target:${Position.Left}:|a:${Position.Left}:48px|b:${Position.Left}:70px|source:${Position.Right}:`;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selfCenter = nodeCenter(self);

  const neighborVector = (neighborId: string | undefined): { dx: number; dy: number; x: number; y: number } | null => {
    if (!neighborId) return null;
    const other = byId.get(neighborId);
    if (!other) return null;
    const c = nodeCenter(other);
    return { dx: c.x - selfCenter.x, dy: c.y - selfCenter.y, x: c.x, y: c.y };
  };

  const averageTargetVector = (edgeList: Edge[]): { dx: number; dy: number; x: number; y: number } | null => {
    let sumDx = 0;
    let sumDy = 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const edge of edgeList) {
      const target = byId.get(edge.target);
      if (!target) continue;
      const c = nodeCenter(target);
      sumDx += c.x - selfCenter.x;
      sumDy += c.y - selfCenter.y;
      sumX += c.x;
      sumY += c.y;
      count++;
    }
    if (count === 0) return null;
    return { dx: sumDx / count, dy: sumDy / count, x: sumX / count, y: sumY / count };
  };

  const outgoing = edges.filter((e) => e.source === nodeId);
  const avgOut = averageTargetVector(outgoing);
  let sourcePos: Position = avgOut ? snapVectorToSide(avgOut.dx, avgOut.dy) : Position.Right;
  const sourceNeighborX = avgOut ? avgOut.x : selfCenter.x + 200;
  const sourceNeighborY = avgOut ? avgOut.y : selfCenter.y;

  type RawItem = {
    id: HandleId;
    side: Position;
    sortX: number;
    sortY: number;
    order: number;
  };

  const items: RawItem[] = [];

  if (isDualInputKind(kind)) {
    const edgeA = edges.find((e) => e.target === nodeId && (e.targetHandle === "a" || !e.targetHandle));
    const edgeB = edges.find((e) => e.target === nodeId && e.targetHandle === "b");
    const vecA = neighborVector(edgeA?.source);
    const vecB = neighborVector(edgeB?.source);
    const defaultTargetSide = sourcePos === Position.Left ? Position.Right : Position.Left;
    const sideA = vecA ? snapVectorToSide(vecA.dx, vecA.dy) : defaultTargetSide;
    const sideB = vecB ? snapVectorToSide(vecB.dx, vecB.dy) : defaultTargetSide;
    if (outgoing.length === 0 && (sideA === Position.Right || sideB === Position.Right)) {
      sourcePos = Position.Left;
    }
    items.push({
      id: "a",
      side: sideA,
      sortX: vecA?.x ?? selfCenter.x - 50,
      sortY: vecA?.y ?? selfCenter.y - 20,
      order: 0,
    });
    items.push({
      id: "b",
      side: sideB,
      sortX: vecB?.x ?? selfCenter.x + 50,
      sortY: vecB?.y ?? selfCenter.y + 20,
      order: 1,
    });
    items.push({
      id: "source",
      side: sourcePos,
      sortX: sourceNeighborX,
      sortY: sourceNeighborY,
      order: 2,
    });
  } else if (isDualOutputKind(kind)) {
    const incoming = edges.find((e) => e.target === nodeId);
    const vecIn = neighborVector(incoming?.source);
    const outA = edges.filter((e) => e.source === nodeId && (e.sourceHandle === "a" || !e.sourceHandle));
    const outB = edges.filter((e) => e.source === nodeId && e.sourceHandle === "b");
    const vecOutA = averageTargetVector(outA);
    const vecOutB = averageTargetVector(outB);

    let targetPos: Position = vecIn ? snapVectorToSide(vecIn.dx, vecIn.dy) : Position.Left;
    const defaultSourceSide = targetPos === Position.Right ? Position.Left : Position.Right;
    const sideA = vecOutA ? snapVectorToSide(vecOutA.dx, vecOutA.dy) : defaultSourceSide;
    const sideB = vecOutB ? snapVectorToSide(vecOutB.dx, vecOutB.dy) : defaultSourceSide;
    if (!vecIn && (sideA === Position.Left || sideB === Position.Left)) {
      targetPos = Position.Right;
    }
    items.push({
      id: "target",
      side: targetPos,
      sortX: vecIn?.x ?? selfCenter.x - 50,
      sortY: vecIn?.y ?? selfCenter.y,
      order: 0,
    });
    items.push({
      id: "a",
      side: sideA,
      sortX: vecOutA?.x ?? selfCenter.x + 50,
      sortY: vecOutA?.y ?? selfCenter.y - 20,
      order: 1,
    });
    items.push({
      id: "b",
      side: sideB,
      sortX: vecOutB?.x ?? selfCenter.x + 50,
      sortY: vecOutB?.y ?? selfCenter.y + 20,
      order: 2,
    });
  } else {
    const incoming = edges.find((e) => e.target === nodeId);
    const vecIn = neighborVector(incoming?.source);
    let targetPos: Position = vecIn
      ? snapVectorToSide(vecIn.dx, vecIn.dy)
      : sourcePos === Position.Left
        ? Position.Right
        : Position.Left;
    if (outgoing.length === 0 && targetPos === Position.Right) {
      sourcePos = Position.Left;
    }
    if (!vecIn && sourcePos === targetPos) {
      targetPos = sourcePos === Position.Left ? Position.Right : Position.Left;
    }
    if (kind !== "input") {
      items.push({
        id: "target",
        side: targetPos,
        sortX: vecIn?.x ?? selfCenter.x - 50,
        sortY: vecIn?.y ?? selfCenter.y - 20,
        order: 0,
      });
    }
    if (kind !== "output") {
      items.push({
        id: "source",
        side: sourcePos,
        sortX: sourceNeighborX,
        sortY: sourceNeighborY,
        order: 2,
      });
    }
  }

  const offsets = new Map<HandleId, string>();
  const bySide = new Map<Position, RawItem[]>();
  for (const item of items) {
    const list = bySide.get(item.side) ?? [];
    list.push(item);
    bySide.set(item.side, list);
  }

  for (const [side, group] of bySide.entries()) {
    const isHorizontalEdge = side === Position.Top || side === Position.Bottom;
    if (
      !isHorizontalEdge &&
      ((isDualInputKind(kind) && !group.some((item) => item.id === "source")) ||
        (isDualOutputKind(kind) && !group.some((item) => item.id === "target")))
    ) {
      for (const item of group) {
        offsets.set(item.id, item.id === "a" ? "48px" : "70px");
      }
      continue;
    }

    if (group.length === 1) {
      offsets.set(group[0].id, "");
      continue;
    }

    group.sort((p, q) => {
      const diff = isHorizontalEdge ? p.sortX - q.sortX : p.sortY - q.sortY;
      return Math.abs(diff) > 1 ? diff : p.order - q.order;
    });

    const slots = group.length === 2 ? ["32%", "68%"] : ["22%", "50%", "78%"];
    group.forEach((item, idx) => {
      offsets.set(item.id, slots[idx] ?? "50%");
    });
  }

  const lookup = (id: HandleId, fallbackSide: Position): string => {
    const found = items.find((i) => i.id === id);
    const side = found?.side ?? fallbackSide;
    const offset = offsets.get(id) ?? "";
    return `${id}:${side}:${offset}`;
  };

  const defaultDualSide = isDualOutputKind(kind) ? Position.Right : Position.Left;
  return [
    lookup("target", Position.Left),
    lookup("a", defaultDualSide),
    lookup("b", defaultDualSide),
    lookup("source", Position.Right),
  ].join("|");
}

function parseHandleLayout(key: string): Record<HandleId, HandlePlacement> {
  const result = {} as Record<HandleId, HandlePlacement>;
  for (const part of key.split("|")) {
    const [id, side, offset] = part.split(":") as [HandleId, Position, string];
    result[id] = { id, side, offset };
  }
  return result;
}

function placementStyle(placement: HandlePlacement): CSSProperties | undefined {
  if (!placement.offset) return undefined;
  if (placement.side === Position.Top || placement.side === Position.Bottom) {
    return { left: placement.offset };
  }
  return { top: placement.offset };
}

function triangleForHandle(type: "source" | "target", position: Position): string {
  if (type === "source") {
    switch (position) {
      case Position.Right:
        return "▸";
      case Position.Bottom:
        return "▾";
      case Position.Left:
        return "◂";
      case Position.Top:
        return "▴";
    }
  } else {
    switch (position) {
      case Position.Left:
        return "▸";
      case Position.Top:
        return "▾";
      case Position.Right:
        return "◂";
      case Position.Bottom:
        return "▴";
    }
  }
}

export function OperationNode({ id, data, selected }: Props) {
  const kind = data.kind;
  const updateNodeInternals = useUpdateNodeInternals();
  const processFullGraph = useGraphStore((s) => s.processFullGraph);
  const isProcessing = useGraphStore((s) => s.isProcessing);
  const lastProcessTime = useGraphStore((s) => s.lastProcessTime);

  const handleLayoutKey = useGraphStore((s) => computeHandleLayoutKey(id, kind, s.nodes, s.edges));
  const layout = parseHandleLayout(handleLayoutKey);

  const dualSlotLabelsKey = useGraphStore((s) => {
    if (isDualInputKind(kind)) {
      const edgeA = s.edges.find((e) => e.target === id && (e.targetHandle === "a" || !e.targetHandle));
      const edgeB = s.edges.find((e) => e.target === id && e.targetHandle === "b");
      const labelA = edgeA ? (s.nodes.find((n) => n.id === edgeA.source)?.data.label ?? "") : "";
      const labelB = edgeB ? (s.nodes.find((n) => n.id === edgeB.source)?.data.label ?? "") : "";
      return `${labelA}|${labelB}`;
    }
    if (isDualOutputKind(kind)) {
      const edgeA = s.edges.find((e) => e.source === id && (e.sourceHandle === "a" || !e.sourceHandle));
      const edgeB = s.edges.find((e) => e.source === id && e.sourceHandle === "b");
      const labelA = edgeA ? (s.nodes.find((n) => n.id === edgeA.target)?.data.label ?? "") : "";
      const labelB = edgeB ? (s.nodes.find((n) => n.id === edgeB.target)?.data.label ?? "") : "";
      return `${labelA}|${labelB}`;
    }
    return "|";
  });
  const [slotLabelA, slotLabelB] = dualSlotLabelsKey.split("|");

  const outputMode = useGraphStore((s) => {
    const out = s.outputs.get(id);
    if (!out || out.length === 0 || (out.length === 1 && out[0] === "")) return "empty";
    if (out.length === 1) return "single";
    return "rows";
  });

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleLayoutKey, updateNodeInternals]);

  return (
    <div className={`op-node op-node--${kind} ${selected ? "op-node--selected" : ""}`}>
      {isDualInputKind(kind) ? (
        <>
          <Handle
            type="target"
            position={layout.a.side}
            id="a"
            style={placementStyle(layout.a)}
            className="op-node__handle op-node__handle--target op-node__handle--a"
            title="Input A"
          >
            <span className="op-node__handle-label" aria-hidden="true">
              A{triangleForHandle("target", layout.a.side)}
            </span>
          </Handle>
          <Handle
            type="target"
            position={layout.b.side}
            id="b"
            style={placementStyle(layout.b)}
            className="op-node__handle op-node__handle--target op-node__handle--b"
            title="Input B"
          >
            <span className="op-node__handle-label" aria-hidden="true">
              B{triangleForHandle("target", layout.b.side)}
            </span>
          </Handle>
        </>
      ) : (
        kind !== "input" && (
          <Handle
            type="target"
            position={layout.target.side}
            style={placementStyle(layout.target)}
            className="op-node__handle op-node__handle--target"
            title="Input"
          >
            <span className="op-node__handle-arrow" aria-hidden="true">
              {triangleForHandle("target", layout.target.side)}
            </span>
          </Handle>
        )
      )}
      <div className="op-node__header">
        <span className="op-node__title">{data.label}</span>
        <span
          className={`op-node__mode-badge op-node__mode-badge--${outputMode}`}
          title={
            outputMode === "rows"
              ? "Multiline mode (multiple rows)"
              : outputMode === "single"
                ? "Single-line mode (1 value)"
                : "No output rows"
          }
        >
          {outputMode === "rows" ? "Rows" : outputMode === "single" ? "Single" : "Empty"}
        </span>
      </div>
      {isDualInputKind(kind) || isDualOutputKind(kind) ? (
        <div className="op-node__merge-body">
          <div className="op-node__merge-row">
            <span className="op-node__handle-tag op-node__handle-tag--a">A</span>
            <span className="op-node__merge-desc">
              {kind === "append"
                ? "Main Input"
                : kind === "partition"
                  ? "Matched (A)"
                  : isDualOutputKind(kind)
                    ? "Output A"
                    : "Input A"}
              {slotLabelA ? ` · ${slotLabelA}` : ""}
            </span>
          </div>
          <div className="op-node__merge-row">
            <span className="op-node__handle-tag op-node__handle-tag--b">B</span>
            <span className="op-node__merge-desc">
              {kind === "append"
                ? "Append Data"
                : kind === "partition"
                  ? "Unmatched (B)"
                  : isDualOutputKind(kind)
                    ? "Output B"
                    : "Input B"}
              {slotLabelB ? ` · ${slotLabelB}` : ""}
            </span>
          </div>
          <div className="op-node__summary">{summarizeNode(data)}</div>
        </div>
      ) : kind === "output" ? (
        <div className="op-node__output-body">
          <button
            className="op-node__process-btn nodrag"
            onClick={(e) => {
              e.stopPropagation();
              processFullGraph();
            }}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing…" : "⚡ Process Now"}
          </button>
          {lastProcessTime !== null && (
            <div className="op-node__output-meta">Processed in {lastProcessTime}ms</div>
          )}
        </div>
      ) : (
        <div className="op-node__summary">{summarizeNode(data)}</div>
      )}
      {isDualOutputKind(kind) ? (
        <>
          <Handle
            type="source"
            position={layout.a.side}
            id="a"
            style={placementStyle(layout.a)}
            className="op-node__handle op-node__handle--source op-node__handle--a"
            title={kind === "partition" ? "Output A (matched rows)" : "Output A (left of delimiter)"}
          >
            <span className="op-node__handle-label" aria-hidden="true">
              A{triangleForHandle("source", layout.a.side)}
            </span>
          </Handle>
          <Handle
            type="source"
            position={layout.b.side}
            id="b"
            style={placementStyle(layout.b)}
            className="op-node__handle op-node__handle--source op-node__handle--b"
            title={kind === "partition" ? "Output B (unmatched rows)" : "Output B (right of delimiter)"}
          >
            <span className="op-node__handle-label" aria-hidden="true">
              B{triangleForHandle("source", layout.b.side)}
            </span>
          </Handle>
        </>
      ) : (
        kind !== "output" && (
          <Handle
            type="source"
            position={layout.source.side}
            style={placementStyle(layout.source)}
            className="op-node__handle op-node__handle--source"
            title="Output"
          >
            <span className="op-node__handle-arrow" aria-hidden="true">
              {triangleForHandle("source", layout.source.side)}
            </span>
          </Handle>
        )
      )}
    </div>
  );
}
