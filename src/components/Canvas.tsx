import { useCallback, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnNodeDrag,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore, type FlowNode } from "../store/useGraphStore";
import { OperationNode } from "./nodes/OperationNode";
import type { OperationKind } from "../types";

const nodeTypes = {
  input: OperationNode,
  split: OperationNode,
  enclose: OperationNode,
  join: OperationNode,
  merge: OperationNode,
  append: OperationNode,
  trim: OperationNode,
  replace: OperationNode,
  case: OperationNode,
  filter: OperationNode,
  output: OperationNode,
};

export function Canvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const addNode = useGraphStore((s) => s.addNode);
  const spliceNodeIntoEdge = useGraphStore((s) => s.spliceNodeIntoEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/texttool-node") as OperationKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const edgeId = findEdgeIdAtPoint(e.clientX, e.clientY);
      addNode(kind, position, edgeId);
    },
    [screenToFlowPosition, addNode]
  );

  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback(
    (_, node) => setSelectedNode(node.id),
    [setSelectedNode]
  );

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (event, node) => {
      if (event.ctrlKey || event.metaKey) {
        let clientX = 0;
        let clientY = 0;
        if ("clientX" in event) {
          clientX = event.clientX;
          clientY = event.clientY;
        } else if ("touches" in event && event.touches && event.touches[0]) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else if ("changedTouches" in event && event.changedTouches && event.changedTouches[0]) {
          clientX = event.changedTouches[0].clientX;
          clientY = event.changedTouches[0].clientY;
        }
        if (clientX || clientY) {
          const edgeId = findEdgeIdAtPoint(clientX, clientY);
          if (edgeId) {
            spliceNodeIntoEdge(node.id, edgeId);
          }
        }
      }
    },
    [spliceNodeIntoEdge]
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      removeEdge(edge.id);
    },
    [removeEdge]
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), [setSelectedNode]);

  return (
    <div className="canvas" ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
        connectionRadius={45}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
