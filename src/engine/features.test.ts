import assert from "node:assert/strict";
import test from "node:test";
import { applyAppend } from "./append.ts";
import { evaluateGraph } from "./evaluate.ts";
import { runOperation, runUnmergeOperation } from "./operations.ts";
import { readPreviewText, splitInputText } from "./textSource.ts";
import { planMagneticConnection } from "../store/magnet.ts";
import { bridgeDeletedNodes, replaceTargetInputEdge } from "../store/useGraphStore.ts";

test("custom input split keeps the delimiter and decodes escapes", () => {
  assert.deepEqual(splitInputText("a|b|c", { inputType: "custom", delimiter: "|" }), ["a", "b", "c"]);
  assert.deepEqual(splitInputText("a\nb", { inputType: "custom", delimiter: "\\n" }), ["a", "b"]);
});

test("file preview stops before the rest of a large blob", async () => {
  const body = Array.from({ length: 5000 }, (_, i) => `row-${i}`).join("\n");
  const blob = new Blob([body]);
  const preview = await readPreviewText(blob, { inputType: "lines", delimiter: "\n" }, 10, 500);
  const rows = splitInputText(preview, { inputType: "lines", delimiter: "\n" });
  assert.equal(rows.length, 10);
  assert.equal(rows[0], "row-0");
  assert.ok(preview.length < body.length / 2);
});

test("append covers start, end, one line, and inserted rows", () => {
  const rows = ["a", "b", "c"];
  assert.deepEqual(applyAppend(rows, [], { text: "!", scope: "all", side: "start", line: 0 }), ["!a", "!b", "!c"]);
  assert.deepEqual(applyAppend(rows, [], { text: "!", scope: "all", side: "end", line: 0 }), ["a!", "b!", "c!"]);
  assert.deepEqual(applyAppend(rows, [], { text: "!", scope: "row", side: "end", line: 2 }), ["a", "b!", "c"]);
  assert.deepEqual(applyAppend(rows, [], { text: "z", scope: "insert", side: "end", line: 0 }), ["a", "b", "c", "z"]);
  assert.deepEqual(applyAppend(rows, [], { text: "z", scope: "insert", side: "start", line: 0 }), ["z", "a", "b", "c"]);
  assert.deepEqual(applyAppend(rows, ["X"], { text: "ignored", scope: "row", side: "start", line: 1 }), ["Xa", "b", "c"]);
});

test("magnetic connect uses left-to-right flow and rejects a cycle", () => {
  const link = planMagneticConnection(
    { id: "drag", kind: "trim", x: 10 },
    { id: "hover", kind: "append", x: 80 },
    [],
    "b",
    "a"
  );
  assert.deepEqual(link, { source: "drag", target: "hover", targetHandle: "b" });

  const blocked = planMagneticConnection(
    { id: "drag", kind: "trim", x: 10 },
    { id: "hover", kind: "case", x: 80 },
    [{ source: "hover", target: "drag" }],
    null,
    null
  );
  assert.equal(blocked, null);
});

test("deleting intermediate node(s) bridges A -> B -> C into A -> C", () => {
  const bridged = bridgeDeletedNodes(
    [{ id: "A" }, { id: "C" }],
    [],
    [{ id: "B" }],
    [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C", targetHandle: "b" },
    ]
  );
  assert.equal(bridged.length, 1);
  assert.equal(bridged[0].source, "A");
  assert.equal(bridged[0].target, "C");
  assert.equal(bridged[0].targetHandle, "b");
});

test("trim strips whitespace by default or custom symbols when specified", () => {
  assert.deepEqual(
    runOperation({ kind: "trim", label: "Trim", params: { mode: "both", chars: "" } }, ["  hello  "]),
    ["hello"]
  );
  assert.deepEqual(
    runOperation({ kind: "trim", label: "Trim", params: { mode: "both", chars: "'-]" } }, ["'--hello-]'"]),
    ["hello"]
  );
});

test("split does not insert blank rows from trailing delimiters or line breaks", () => {
  assert.deepEqual(
    runOperation({ kind: "split", label: "Split", params: { delimiter: ",", useRegex: false } }, [
      "apple,",
      "banana,",
      "carrot",
    ]),
    ["apple", "banana", "carrot"]
  );
  assert.deepEqual(
    runOperation({ kind: "split", label: "Split", params: { delimiter: ",", useRegex: false } }, [
      "apple,\nbanana,\ncarrot",
    ]),
    ["apple", "banana", "carrot"]
  );
});

test("single-input nodes replace any existing incoming connection when a new one is made", () => {
  const nodes = [
    { id: "in-a", data: { kind: "input" as const } },
    { id: "in-b", data: { kind: "input" as const } },
    { id: "split-1", data: { kind: "split" as const } },
  ];
  const existingEdges = [{ id: "e1", source: "in-a", target: "split-1", targetHandle: undefined }];
  const remaining = replaceTargetInputEdge(existingEdges, nodes, "split-1", null);
  assert.equal(remaining.length, 0);
});

test("tail preview lazily extracts the last N rows or chars for inline and file inputs", async () => {
  const lines = Array.from({ length: 100 }, (_, i) => `item-${i}`).join("\n");
  assert.deepEqual(
    splitInputText(lines, { inputType: "lines", delimiter: "\n" }, 3, "tail"),
    ["item-97", "item-98", "item-99"]
  );

  assert.deepEqual(
    splitInputText("a,b,c,d,e,", { inputType: "custom", delimiter: "," }, 2, "tail"),
    ["d", "e"]
  );

  assert.deepEqual(
    runOperation(
      { kind: "input", label: "Input", params: { source: "text", text: "abcdefghij", inputType: "single", delimiter: "," } },
      [],
      { charLimit: 4, direction: "tail" }
    ),
    ["ghij"]
  );

  const body = Array.from({ length: 5000 }, (_, i) => `row-${i}`).join("\n");
  const blob = new Blob([body]);
  const tailText = await readPreviewText(blob, { inputType: "lines", delimiter: "\n" }, 5, 500, "tail");
  const tailRows = splitInputText(tailText, { inputType: "lines", delimiter: "\n" }, 5, "tail");
  assert.deepEqual(tailRows, ["row-4995", "row-4996", "row-4997", "row-4998", "row-4999"]);
});

test("unmerge splits rows at first or last occurrence into outputs A and B", () => {
  const rows = ["a:b:c", "x:y", "no-colon"];
  assert.deepEqual(
    runUnmergeOperation({ delimiter: ":", occurrence: "first", missingFallback: "N/A" }, rows),
    {
      a: ["a", "x", "no-colon"],
      b: ["b:c", "y", "N/A"],
    }
  );
  assert.deepEqual(
    runUnmergeOperation({ delimiter: ":", occurrence: "last", missingFallback: "" }, rows),
    {
      a: ["a:b", "x", "no-colon"],
      b: ["c", "y", ""],
    }
  );

  const outputs = evaluateGraph(
    [
      {
        id: "in-1",
        position: { x: 0, y: 0 },
        data: { kind: "input", label: "Input", params: { source: "text", text: "first second\nalpha beta", fileName: "", fileSize: 0, inputType: "lines", delimiter: "," } },
      },
      {
        id: "unmerge-1",
        position: { x: 100, y: 0 },
        data: { kind: "unmerge", label: "Unmerge", params: { delimiter: " ", occurrence: "first", missingFallback: "" } },
      },
      {
        id: "out-a",
        position: { x: 200, y: -40 },
        data: { kind: "output", label: "Out A", params: { filename: "a.txt" } },
      },
      {
        id: "out-b",
        position: { x: 200, y: 40 },
        data: { kind: "output", label: "Out B", params: { filename: "b.txt" } },
      },
    ],
    [
      { id: "e1", source: "in-1", target: "unmerge-1" },
      { id: "e2", source: "unmerge-1", target: "out-a", sourceHandle: "a" },
      { id: "e3", source: "unmerge-1", target: "out-b", sourceHandle: "b" },
    ]
  );

  assert.deepEqual(outputs.get("out-a"), ["first", "alpha"]);
  assert.deepEqual(outputs.get("out-b"), ["second", "beta"]);
});


