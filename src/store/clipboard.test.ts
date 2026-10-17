import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";
import { pasteClipboard, snapshotSelection } from "./clipboard.ts";
import type { FlowNode } from "./useGraphStore.ts";

function node(id: string, selected = false): FlowNode {
  return {
    id,
    type: "split",
    position: { x: 10, y: 20 },
    selected,
    data: { kind: "split", label: "Split", params: { delimiter: ",", useRegex: false } },
  };
}

test("snapshot keeps only edges inside the selection and clones params", () => {
  const nodes = [node("a", true), node("b", true), node("c")];
  const edges: Edge[] = [
    { id: "ab", source: "a", target: "b", sourceHandle: null, targetHandle: "a" },
    { id: "bc", source: "b", target: "c" },
  ];

  const clip = snapshotSelection(nodes, edges, null);
  assert.ok(clip);
  assert.deepEqual(clip.nodes.map((n) => n.id), ["a", "b"]);
  assert.deepEqual(clip.edges.map((e) => e.id), ["ab"]);
  assert.equal(clip.edges[0].targetHandle, "a");

  clip.nodes[0].data.params = { delimiter: "|", useRegex: true };
  assert.equal(nodes[0].data.params.delimiter, ",");
});

test("paste assigns new ids, offsets position, and remaps internal edges", () => {
  const clip = snapshotSelection([node("a", true), node("b", true)], [{ id: "ab", source: "a", target: "b" }], null);
  assert.ok(clip);
  let n = 0;
  const pasted = pasteClipboard(clip, 1, () => `id-${n++}`);

  assert.deepEqual(
    pasted.nodes.map((node) => [node.id, node.position.x, node.position.y, node.selected]),
    [
      ["id-0", 10 + 96, 20 + 96, true],
      ["id-1", 10 + 96, 20 + 96, true],
    ]
  );
  assert.equal(pasted.edges.length, 1);
  assert.equal(pasted.edges[0].source, "id-0");
  assert.equal(pasted.edges[0].target, "id-1");
  assert.notEqual(pasted.edges[0].id, "ab");
});
