import assert from "node:assert/strict";
import test from "node:test";
import { applyAppend } from "./append.ts";
import { runOperation } from "./operations.ts";
import { readPreviewText, splitInputText } from "./textSource.ts";
import { planMagneticConnection } from "../store/magnet.ts";
import { bridgeDeletedNodes } from "../store/useGraphStore.ts";

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
