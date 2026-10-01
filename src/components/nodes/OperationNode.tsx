import { Handle, Position, type NodeProps } from "@xyflow/react";
import { summarizeNode, type NodeData, type OperationKind } from "../../types";
import { useGraphStore } from "../../store/useGraphStore";
import "./OperationNode.css";

type Props = NodeProps & { data: NodeData<OperationKind> };

export function OperationNode({ data, selected }: Props) {
  const kind = data.kind;
  const processFullGraph = useGraphStore((s) => s.processFullGraph);
  const isProcessing = useGraphStore((s) => s.isProcessing);
  const lastProcessTime = useGraphStore((s) => s.lastProcessTime);

  return (
    <div className={`op-node op-node--${kind} ${selected ? "op-node--selected" : ""}`}>
      {kind === "merge" || kind === "append" ? (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="a"
            className="op-node__handle--a"
            title="Input A"
          />
          <Handle
            type="target"
            position={Position.Left}
            id="b"
            className="op-node__handle--b"
            title="Input B"
          />
        </>
      ) : (
        kind !== "input" && <Handle type="target" position={Position.Left} />
      )}
      <div className="op-node__header">{data.label}</div>
      {kind === "merge" || kind === "append" ? (
        <div className="op-node__merge-body">
          <div className="op-node__merge-row">
            <span className="op-node__handle-tag">A</span>
            <span className="op-node__merge-desc">
              {kind === "append" ? "Main Input" : "Input A"}
            </span>
          </div>
          <div className="op-node__merge-row">
            <span className="op-node__handle-tag">B</span>
            <span className="op-node__merge-desc">
              {kind === "append" ? "Append Data" : "Input B"}
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
      {kind !== "output" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
