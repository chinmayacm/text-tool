import assert from "node:assert/strict";
import test from "node:test";
import type { Node, Viewport } from "@xyflow/react";
import { defaultParams, type NodeData, type OperationKind } from "../types.ts";
import {
  createProjectArchive,
  createProjectSnapshot,
  readProjectArchive,
} from "./projectPersistence.ts";

test("project archive round-trips graph, viewport, settings, and attached file data", async () => {
  const viewport: Viewport = { x: 12, y: -4, zoom: 1.25 };
  const nodes: Node<NodeData<OperationKind>>[] = [
    {
      id: "input-1",
      type: "input",
      position: { x: 20, y: 30 },
      data: { kind: "input", label: "Source", params: defaultParams("input") },
    },
  ];
  const project = createProjectSnapshot({
    nodes,
    edges: [],
    viewport,
    previewRowLimitMode: "50",
    previewRowCustom: 75,
    previewCharLimitMode: "1000",
    previewCharCustom: 1200,
  });
  project.files.push({
    nodeId: "input-1",
    name: "sample.csv",
    type: "text/csv",
    blob: new Blob(["one,two\nthree,four"], { type: "text/csv" }),
  });

  const archive = await createProjectArchive(project);
  const restored = await readProjectArchive(archive);

  assert.deepEqual(restored.nodes, nodes);
  assert.deepEqual(restored.viewport, viewport);
  assert.equal(restored.preview.rowMode, "50");
  assert.equal(restored.preview.charCustom, 1200);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.files[0].name, "sample.csv");
  assert.equal(await restored.files[0].blob.text(), "one,two\nthree,four");
});
