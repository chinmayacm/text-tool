import assert from "node:assert/strict";
import test from "node:test";
import { applyAppend } from "./append.ts";
import { evaluateGraph } from "./evaluate.ts";
import {
  runCompareOperation,
  runExtractOperation,
  runNumberOperation,
  runOperation,
  runPadOperation,
  runPartitionOperation,
  runSliceOperation,
  runSortOperation,
  runTemplateOperation,
  runUniqueOperation,
  runUnmergeOperation,
} from "./operations.ts";
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

test("sort supports rows, in-row delimiter sorting, and combined both-mode sorting", () => {
  const baseParams = {
    scope: "rows" as const,
    delimiter: ",",
    direction: "asc" as const,
    mode: "natural" as const,
    caseSensitive: false,
    unique: false,
    trimItems: true,
  };

  // 1. Sort rows vertically
  assert.deepEqual(
    runSortOperation(baseParams, ["cherry", "apple", "banana"]),
    ["apple", "banana", "cherry"]
  );

  // 2. Sort single-row or multi-row text by delimiter ("a,e,g,b" -> "a,b,e,g")
  assert.deepEqual(
    runSortOperation({ ...baseParams, scope: "delimited", delimiter: "," }, ["a,e,g,b"]),
    ["a,b,e,g"]
  );
  assert.deepEqual(
    runSortOperation({ ...baseParams, scope: "delimited", delimiter: ",", trimItems: true }, ["z, a, m", "d, c, b"]),
    ["a,m,z", "b,c,d"]
  );

  // 3. Sort values in each row by delimiter AND then sort rows ("both")
  assert.deepEqual(
    runSortOperation({ ...baseParams, scope: "both", delimiter: "," }, ["z,b,d", "c,a,e"]),
    ["a,c,e", "b,d,z"]
  );

  // 4. Natural vs alpha vs numeric vs length + deduplication
  assert.deepEqual(
    runSortOperation({ ...baseParams, mode: "natural" }, ["item10", "item2", "item1"]),
    ["item1", "item2", "item10"]
  );
  assert.deepEqual(
    runSortOperation({ ...baseParams, mode: "alpha" }, ["item10", "item2", "item1"]),
    ["item1", "item10", "item2"]
  );
  assert.deepEqual(
    runSortOperation({ ...baseParams, mode: "numeric", direction: "desc" }, ["2", "10.5", "-5"]),
    ["10.5", "2", "-5"]
  );
  assert.deepEqual(
    runSortOperation({ ...baseParams, mode: "length" }, ["elephant", "cat", "dog"]),
    ["cat", "dog", "elephant"]
  );
  assert.deepEqual(
    runSortOperation({ ...baseParams, scope: "delimited", unique: true }, ["b,a,B,c,a"]),
    ["a,b,c"]
  );
});

test("compare, partition, slice, unique, number, extract, pad, and template nodes", () => {
  // Compare (diff, intersect, xor, union)
  assert.deepEqual(
    runCompareOperation(
      { mode: "diff", caseSensitive: false, unique: true, trimCompare: true },
      ["apple", "banana", "carrot", "APPLE"],
      ["banana"]
    ),
    ["apple", "carrot"]
  );
  assert.deepEqual(
    runCompareOperation(
      { mode: "intersect", caseSensitive: false, unique: true, trimCompare: true },
      ["apple", "banana"],
      ["BANANA", "date"]
    ),
    ["banana"]
  );

  // Partition
  assert.deepEqual(
    runPartitionOperation(
      { pattern: "^ERROR", useRegex: true, caseSensitive: true },
      ["ERROR [auth]", "INFO [api]", "ERROR [db]"]
    ),
    {
      a: ["ERROR [auth]", "ERROR [db]"],
      b: ["INFO [api]"],
    }
  );

  // Slice (skip, range, step)
  assert.deepEqual(
    runSliceOperation(
      { mode: "skip", skipStart: 1, skipEnd: 1, startLine: 1, endLine: 0, step: 2, offset: 1 },
      ["header", "r1", "r2", "footer"]
    ),
    ["r1", "r2"]
  );
  assert.deepEqual(
    runSliceOperation(
      { mode: "step", skipStart: 0, skipEnd: 0, startLine: 1, endLine: 0, step: 2, offset: 1 },
      ["a", "b", "c", "d", "e"]
    ),
    ["a", "c", "e"]
  );

  // Unique & frequency counts
  assert.deepEqual(
    runUniqueOperation(
      { mode: "unique", caseSensitive: false, showCount: true, countPrefix: " × " },
      ["apple", "banana", "APPLE", "apple", "carrot"]
    ),
    ["3 × apple", "1 × banana", "1 × carrot"]
  );
  assert.deepEqual(
    runUniqueOperation(
      { mode: "duplicates", caseSensitive: false, showCount: false, countPrefix: " × " },
      ["apple", "banana", "APPLE"]
    ),
    ["apple"]
  );

  // Number rows
  assert.deepEqual(
    runNumberOperation(
      { start: 1, step: 1, padWidth: 2, side: "start", separator: ". ", skipEmpty: true },
      ["first", "", "second"]
    ),
    ["01. first", "", "02. second"]
  );

  // Extract (column, between, regex)
  assert.deepEqual(
    runExtractOperation(
      {
        mode: "column",
        delimiter: ",",
        column: 2,
        trimValues: true,
        startDelim: "[",
        endDelim: "]",
        pattern: "",
        group: 1,
        missingFallback: "",
        dropUnmatched: false,
      },
      ["alice, eng, core", "bob, design, ui"]
    ),
    ["eng", "design"]
  );
  assert.deepEqual(
    runExtractOperation(
      {
        mode: "between",
        delimiter: ",",
        column: 1,
        trimValues: true,
        startDelim: "[",
        endDelim: "]",
        pattern: "",
        group: 1,
        missingFallback: "",
        dropUnmatched: true,
      },
      ["ERROR [auth] bad token", "plain line", "ERROR [db] timeout"]
    ),
    ["auth", "db"]
  );

  // Pad / Truncate
  assert.deepEqual(
    runPadOperation({ mode: "padStart", width: 5, padChar: "0", ellipsis: "…" }, ["42", "123456"]),
    ["00042", "123456"]
  );
  assert.deepEqual(
    runPadOperation({ mode: "truncate", width: 5, padChar: " ", ellipsis: "…" }, ["hello world", "hi"]),
    ["hell…", "hi"]
  );

  // Template
  assert.deepEqual(
    runTemplateOperation(
      { template: "({i}) {col1} -> {col2}", delimiter: ",", skipEmpty: true },
      ["Alice, Engineer", "Bob, Designer"]
    ),
    ["(1) Alice -> Engineer", "(2) Bob -> Designer"]
  );
});

test("enhanced existing nodes: trim collapseSpaces, enclose/join skipEmpty, replace dollar & case-insensitive, developer case modes, filter skipEmpty, and invalid regex resilience", () => {
  // Trim collapseSpaces
  assert.deepEqual(
    runOperation(
      { kind: "trim", label: "Trim", params: { mode: "both", chars: "", collapseSpaces: true } },
      ["  hello    world   again  "]
    ),
    ["hello world again"]
  );

  // Enclose skipEmpty & escape decoding
  assert.deepEqual(
    runOperation(
      { kind: "enclose", label: "Enclose", params: { prefix: "'", suffix: "'", skipEmpty: true } },
      ["apple", "", "banana"]
    ),
    ["'apple'", "", "'banana'"]
  );

  // Join skipEmpty & escape decoding
  assert.deepEqual(
    runOperation(
      { kind: "join", label: "Join", params: { delimiter: "\\t", skipEmpty: true } },
      ["apple", "", "banana"]
    ),
    ["apple\tbanana"]
  );

  // Replace case-insensitive + literal $ safety when useRegex is false
  assert.deepEqual(
    runOperation(
      {
        kind: "replace",
        label: "Replace",
        params: { find: "price", replaceWith: "$100", useRegex: false, all: true, caseSensitive: false },
      },
      ["PRICE is price"]
    ),
    ["$100 is $100"]
  );

  // Case developer modes (camel, pascal, snake, kebab, constant)
  assert.deepEqual(
    runOperation({ kind: "case", label: "Case", params: { mode: "camel" } }, ["First Name_ID"]),
    ["firstNameId"]
  );
  assert.deepEqual(
    runOperation({ kind: "case", label: "Case", params: { mode: "snake" } }, ["firstNameID"]),
    ["first_name_id"]
  );
  assert.deepEqual(
    runOperation({ kind: "case", label: "Case", params: { mode: "kebab" } }, ["Hello World"]),
    ["hello-world"]
  );
  assert.deepEqual(
    runOperation({ kind: "case", label: "Case", params: { mode: "constant" } }, ["api base url"]),
    ["API_BASE_URL"]
  );

  // Filter skipEmpty + case-insensitive default
  assert.deepEqual(
    runOperation(
      {
        kind: "filter",
        label: "Filter",
        params: { pattern: "error", useRegex: false, invert: false, caseSensitive: false, skipEmpty: true },
      },
      ["", "ERROR: timeout", "info: ok", "   "]
    ),
    ["ERROR: timeout"]
  );

  // Invalid regex falls back safely without throwing
  assert.deepEqual(
    runOperation(
      {
        kind: "filter",
        label: "Filter",
        params: { pattern: "[unclosed", useRegex: true, invert: false },
      },
      ["has [unclosed bracket", "other"]
    ),
    ["has [unclosed bracket"]
  );
});





