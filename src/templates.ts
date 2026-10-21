import type { Edge, Node } from "@xyflow/react";
import { defaultParams, type NodeData, type OperationKind } from "./types.ts";

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  createGraph: () => {
    nodes: Node<NodeData<OperationKind>>[];
    edges: Edge[];
  };
}

export function createStarterGraph(): {
  nodes: Node<NodeData<OperationKind>>[];
  edges: Edge[];
} {
  const inputId = "input-1";
  const outputId = "output-1";
  return {
    nodes: [
      {
        id: inputId,
        type: "input",
        position: { x: 80, y: 160 },
        data: {
          kind: "input",
          label: "Input",
          params: defaultParams("input"),
        },
      },
      {
        id: outputId,
        type: "output",
        position: { x: 400, y: 160 },
        data: {
          kind: "output",
          label: "Output",
          params: defaultParams("output"),
        },
      },
    ],
    edges: [
      {
        id: `e-${inputId}-${outputId}`,
        source: inputId,
        target: outputId,
        sourceHandle: null,
        targetHandle: null,
      },
    ],
  };
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: "rows-to-quoted-list",
    name: "Rows to Quoted List",
    description: "Trim → Enclose ('…') → Join (, )",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 160 },
          data: {
            kind: "input",
            label: "Input",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "apple\nbanana\ncarrot\ndate",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-trim",
          type: "trim",
          position: { x: 300, y: 160 },
          data: {
            kind: "trim",
            label: "Trim",
            params: { mode: "both" },
          },
        },
        {
          id: "tpl-enclose",
          type: "enclose",
          position: { x: 540, y: 160 },
          data: {
            kind: "enclose",
            label: "Enclose",
            params: { prefix: "'", suffix: "'" },
          },
        },
        {
          id: "tpl-join",
          type: "join",
          position: { x: 780, y: 160 },
          data: {
            kind: "join",
            label: "Join",
            params: { delimiter: ", " },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 1020, y: 160 },
          data: {
            kind: "output",
            label: "Output",
            params: defaultParams("output"),
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-trim", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-trim", target: "tpl-enclose", sourceHandle: null, targetHandle: null },
        { id: "e-3", source: "tpl-enclose", target: "tpl-join", sourceHandle: null, targetHandle: null },
        { id: "e-4", source: "tpl-join", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "quoted-list-to-rows",
    name: "Quoted List to Rows",
    description: "Split (,) → Trim → Trim ('\")",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 160 },
          data: {
            kind: "input",
            label: "Input",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "'apple', 'banana', 'carrot', 'date'",
              inputType: "single",
            },
          },
        },
        {
          id: "tpl-split",
          type: "split",
          position: { x: 300, y: 160 },
          data: {
            kind: "split",
            label: "Split",
            params: { delimiter: ",", useRegex: false },
          },
        },
        {
          id: "tpl-trim",
          type: "trim",
          position: { x: 540, y: 160 },
          data: {
            kind: "trim",
            label: "Trim",
            params: { mode: "both", chars: "" },
          },
        },
        {
          id: "tpl-trim-quotes",
          type: "trim",
          position: { x: 780, y: 160 },
          data: {
            kind: "trim",
            label: "Trim Quotes",
            params: { mode: "both", chars: "'\"" },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 1020, y: 160 },
          data: {
            kind: "output",
            label: "Output",
            params: defaultParams("output"),
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-split", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-split", target: "tpl-trim", sourceHandle: null, targetHandle: null },
        { id: "e-3", source: "tpl-trim", target: "tpl-trim-quotes", sourceHandle: null, targetHandle: null },
        { id: "e-4", source: "tpl-trim-quotes", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "clean-filter-lines",
    name: "Clean & Filter Lines",
    description: "Trim → Drop empty → Title Case",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 160 },
          data: {
            kind: "input",
            label: "Input",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "  apple pie \n\n banana bread  \n  carrot cake ",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-trim",
          type: "trim",
          position: { x: 300, y: 160 },
          data: {
            kind: "trim",
            label: "Trim",
            params: { mode: "both" },
          },
        },
        {
          id: "tpl-filter",
          type: "filter",
          position: { x: 540, y: 160 },
          data: {
            kind: "filter",
            label: "Non-empty",
            params: { pattern: ".+", useRegex: true, invert: false },
          },
        },
        {
          id: "tpl-case",
          type: "case",
          position: { x: 780, y: 160 },
          data: {
            kind: "case",
            label: "Title Case",
            params: { mode: "title" },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 1020, y: 160 },
          data: {
            kind: "output",
            label: "Output",
            params: defaultParams("output"),
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-trim", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-trim", target: "tpl-filter", sourceHandle: null, targetHandle: null },
        { id: "e-3", source: "tpl-filter", target: "tpl-case", sourceHandle: null, targetHandle: null },
        { id: "e-4", source: "tpl-case", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "merge-two-lists",
    name: "Merge Two Lists",
    description: "Input A + Input B → Merge",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input-a",
          type: "input",
          position: { x: 60, y: 90 },
          data: {
            kind: "input",
            label: "Input A",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "1.\n2.\n3.",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-input-b",
          type: "input",
          position: { x: 60, y: 250 },
          data: {
            kind: "input",
            label: "Input B",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "First item\nSecond item\nThird item",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-merge",
          type: "merge",
          position: { x: 340, y: 170 },
          data: {
            kind: "merge",
            label: "Merge",
            params: { delimiter: " ", missingFallback: "" },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 600, y: 170 },
          data: {
            kind: "output",
            label: "Output",
            params: defaultParams("output"),
          },
        },
      ],
      edges: [
        { id: "e-a", source: "tpl-input-a", target: "tpl-merge", sourceHandle: null, targetHandle: "a" },
        { id: "e-b", source: "tpl-input-b", target: "tpl-merge", sourceHandle: null, targetHandle: "b" },
        { id: "e-out", source: "tpl-merge", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "unmerge-json-key-values",
    name: "Unmerge JSON Key-Values",
    description: "Trim ({}, ) → Unmerge (:) → Keys & Values",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 80, y: 220 },
          data: {
            kind: "input",
            label: "Input",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: '{"apple":"banana",\n"carrot":"date",\n"dog":"man" }',
              inputType: "lines",
              delimiter: ",",
            },
          },
        },
        {
          id: "tpl-trim-braces",
          type: "trim",
          position: { x: 340, y: 220 },
          data: {
            kind: "trim",
            label: "Trim { } ,",
            params: { mode: "both", chars: "{}, " },
          },
        },
        {
          id: "tpl-unmerge",
          type: "unmerge",
          position: { x: 600, y: 205 },
          data: {
            kind: "unmerge",
            label: "Unmerge",
            params: { delimiter: ":", occurrence: "first", missingFallback: "" },
          },
        },
        {
          id: "tpl-output-keys",
          type: "output",
          position: { x: 880, y: 130 },
          data: {
            kind: "output",
            label: "Keys Output",
            params: { filename: "keys.txt" },
          },
        },
        {
          id: "tpl-output-values",
          type: "output",
          position: { x: 880, y: 290 },
          data: {
            kind: "output",
            label: "Values Output",
            params: { filename: "values.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-trim-braces", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-trim-braces", target: "tpl-unmerge", sourceHandle: null, targetHandle: null },
        { id: "e-3a", source: "tpl-unmerge", target: "tpl-output-keys", sourceHandle: "a", targetHandle: null },
        { id: "e-3b", source: "tpl-unmerge", target: "tpl-output-values", sourceHandle: "b", targetHandle: null },
      ],
    }),
  },
  {
    id: "sort-tags-and-rows",
    name: "Sort & Deduplicate Tag Rows",
    description: "Input → Sort (by ',' + rows, unique) → Output",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 80, y: 200 },
          data: {
            kind: "input",
            label: "Tag Rows Input",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "zebra, apple, mango, apple\npear, banana, kiwi\nfig, cherry, apricot, cherry\norange, date, grape",
              inputType: "lines",
              delimiter: ",",
            },
          },
        },
        {
          id: "tpl-sort",
          type: "sort",
          position: { x: 360, y: 200 },
          data: {
            kind: "sort",
            label: "Sort Items & Rows",
            params: {
              scope: "both",
              delimiter: ",",
              direction: "asc",
              mode: "natural",
              caseSensitive: false,
              unique: true,
              trimItems: true,
            },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 640, y: 200 },
          data: {
            kind: "output",
            label: "Sorted Output",
            params: { filename: "sorted-tags.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-sort", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-sort", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "compare-lists-diff",
    name: "Compare Two Lists (A − B)",
    description: "Compare (A − B) → Number (01. ) → Output",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input-a",
          type: "input",
          position: { x: 60, y: 110 },
          data: {
            kind: "input",
            label: "All Users (A)",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "alice@example.com\nbob@example.com\ncarol@example.com\ndave@example.com\neve@example.com",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-input-b",
          type: "input",
          position: { x: 60, y: 270 },
          data: {
            kind: "input",
            label: "Blocklist (B)",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "bob@example.com\ndave@example.com",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-compare",
          type: "compare",
          position: { x: 340, y: 185 },
          data: {
            kind: "compare",
            label: "Exclude Blocklist",
            params: { mode: "diff", caseSensitive: false, unique: true, trimCompare: true },
          },
        },
        {
          id: "tpl-number",
          type: "number",
          position: { x: 600, y: 185 },
          data: {
            kind: "number",
            label: "Number Active",
            params: { start: 1, step: 1, padWidth: 2, side: "start", separator: ". ", skipEmpty: true },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 860, y: 185 },
          data: {
            kind: "output",
            label: "Active Users",
            params: { filename: "active-users.txt" },
          },
        },
      ],
      edges: [
        { id: "e-a", source: "tpl-input-a", target: "tpl-compare", sourceHandle: null, targetHandle: "a" },
        { id: "e-b", source: "tpl-input-b", target: "tpl-compare", sourceHandle: null, targetHandle: "b" },
        { id: "e-num", source: "tpl-compare", target: "tpl-number", sourceHandle: null, targetHandle: null },
        { id: "e-out", source: "tpl-number", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "csv-to-sql-template",
    name: "Quoted CSV to SQL Inserts",
    description: "Slice (skip header) → Template (Quote-aware CSV) → Output",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 190 },
          data: {
            kind: "input",
            label: "CSV Input",
            note: "Contains quoted commas in Name & Location",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: 'name,role,location\n"Smith, Alice",Staff Engineer,"San Francisco, CA"\n"Jones, Bob",Product Designer,"New York, NY"\n"Lee, Carol",Engineering Manager,"Austin, TX"',
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-slice",
          type: "slice",
          position: { x: 340, y: 190 },
          data: {
            kind: "slice",
            label: "Skip Header Row",
            note: "Drop 1st row (CSV column headers)",
            params: {
              ...defaultParams("slice"),
              mode: "skip",
              skipStart: 1,
              skipEnd: 0,
            },
          },
        },
        {
          id: "tpl-template",
          type: "template",
          position: { x: 620, y: 190 },
          data: {
            kind: "template",
            label: "Format SQL Row",
            note: "Quote-aware CSV keeps commas inside quotes intact",
            params: {
              template: "INSERT INTO staff (id, name, role, city) VALUES ({i}, '{col1}', '{col2}', '{col3}');",
              delimiter: ",",
              quoteAware: true,
              skipEmpty: true,
            },
          },
        },
        {
          id: "tpl-output",
          type: "output",
          position: { x: 920, y: 190 },
          data: {
            kind: "output",
            label: "SQL Output",
            params: { filename: "seed.sql" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-slice", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-slice", target: "tpl-template", sourceHandle: null, targetHandle: null },
        { id: "e-3", source: "tpl-template", target: "tpl-output", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "partition-and-extract-logs",
    name: "Partition & Count Log Errors",
    description: "Partition (ERROR) → Extract [service] → Unique (+count)",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 210 },
          data: {
            kind: "input",
            label: "Log Lines",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "ERROR [auth] Invalid token\nINFO [api] GET /health 200\nERROR [db] Connection timeout\nERROR [auth] Expired session\nINFO [worker] Job finished",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-partition",
          type: "partition",
          position: { x: 310, y: 195 },
          data: {
            kind: "partition",
            label: "Branch ERRORs",
            note: "A = matching ERRORs, B = remaining logs",
            params: { pattern: "ERROR", useRegex: false, caseSensitive: true },
          },
        },
        {
          id: "tpl-extract",
          type: "extract",
          position: { x: 580, y: 120 },
          data: {
            kind: "extract",
            label: "Extract [Service]",
            params: {
              ...defaultParams("extract"),
              mode: "between",
              startDelim: "[",
              endDelim: "]",
            },
          },
        },
        {
          id: "tpl-unique",
          type: "unique",
          position: { x: 830, y: 120 },
          data: {
            kind: "unique",
            label: "Count by Service",
            params: { mode: "unique", caseSensitive: false, showCount: true, countPrefix: " × " },
          },
        },
        {
          id: "tpl-out-errors",
          type: "output",
          position: { x: 1080, y: 120 },
          data: {
            kind: "output",
            label: "Error Counts",
            params: { filename: "error-counts.txt" },
          },
        },
        {
          id: "tpl-out-info",
          type: "output",
          position: { x: 580, y: 290 },
          data: {
            kind: "output",
            label: "Non-Error Logs",
            params: { filename: "info-logs.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-partition", sourceHandle: null, targetHandle: null },
        { id: "e-2a", source: "tpl-partition", target: "tpl-extract", sourceHandle: "a", targetHandle: null },
        { id: "e-3a", source: "tpl-extract", target: "tpl-unique", sourceHandle: null, targetHandle: null },
        { id: "e-4a", source: "tpl-unique", target: "tpl-out-errors", sourceHandle: null, targetHandle: null },
        { id: "e-2b", source: "tpl-partition", target: "tpl-out-info", sourceHandle: "b", targetHandle: null },
      ],
    }),
  },
  {
    id: "extract-and-summarize-stats",
    name: "Extract & Summarize Order Stats",
    description: "Quote-aware Extract → Numeric Stats & Category Frequency",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 200 },
          data: {
            kind: "input",
            label: "Order Rows",
            note: "CSV with quoted product descriptions",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: 'Order #101, Audio, "Headphones, Wireless", $120.50\nOrder #102, Peripherals, "Keyboard, Mechanical", $85.00\nOrder #103, Displays, "Monitor, 27-inch 4K", $299.99\nOrder #104, Audio, "USB-C DAC, Portable", $49.50\nOrder #105, Peripherals, "Mouse, Ergonomic", $45.00\nOrder #106, Audio, "Studio Mic, Condenser", $150.00',
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-extract-price",
          type: "extract",
          position: { x: 350, y: 110 },
          data: {
            kind: "extract",
            label: "Extract Price (Col 4)",
            note: "Quote-aware column 4 ($ amounts)",
            params: {
              ...defaultParams("extract"),
              mode: "column",
              delimiter: ",",
              column: 4,
              quoteAware: true,
              trimValues: true,
            },
          },
        },
        {
          id: "tpl-stats-price",
          type: "stats",
          position: { x: 640, y: 110 },
          data: {
            kind: "stats",
            label: "Order Price Stats",
            note: "Sum, Average, Median, Min & Max",
            params: {
              mode: "numeric",
              separator: ": ",
              includeLabels: true,
              caseSensitive: false,
            },
          },
        },
        {
          id: "tpl-output-price",
          type: "output",
          position: { x: 920, y: 110 },
          data: {
            kind: "output",
            label: "Price Summary",
            params: { filename: "order-stats.txt" },
          },
        },
        {
          id: "tpl-extract-cat",
          type: "extract",
          position: { x: 350, y: 295 },
          data: {
            kind: "extract",
            label: "Extract Category (Col 2)",
            params: {
              ...defaultParams("extract"),
              mode: "column",
              delimiter: ",",
              column: 2,
              quoteAware: true,
              trimValues: true,
            },
          },
        },
        {
          id: "tpl-stats-freq",
          type: "stats",
          position: { x: 640, y: 295 },
          data: {
            kind: "stats",
            label: "Category Frequency",
            note: "Sorted frequency table with % share",
            params: {
              mode: "frequency",
              separator: ": ",
              includeLabels: true,
              caseSensitive: false,
            },
          },
        },
        {
          id: "tpl-output-freq",
          type: "output",
          position: { x: 920, y: 295 },
          data: {
            kind: "output",
            label: "Category Breakdown",
            params: { filename: "category-frequency.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1a", source: "tpl-input", target: "tpl-extract-price", sourceHandle: null, targetHandle: null },
        { id: "e-2a", source: "tpl-extract-price", target: "tpl-stats-price", sourceHandle: null, targetHandle: null },
        { id: "e-3a", source: "tpl-stats-price", target: "tpl-output-price", sourceHandle: null, targetHandle: null },
        { id: "e-1b", source: "tpl-input", target: "tpl-extract-cat", sourceHandle: null, targetHandle: null },
        { id: "e-2b", source: "tpl-extract-cat", target: "tpl-stats-freq", sourceHandle: null, targetHandle: null },
        { id: "e-3b", source: "tpl-stats-freq", target: "tpl-output-freq", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "regex-extract-emails-domains",
    name: "Regex Extract Emails & Top Domains",
    description: "Extract (Email Preset) → Lowercase → Unmerge (@) → Domain Frequency",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 200 },
          data: {
            kind: "input",
            label: "Raw Ticket Logs",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "Ticket #401: Contact ALICE@acme.io regarding invoice\nTicket #402: Escalated by bob.smith@globex.com\nTicket #403: System ping (no email attached)\nTicket #404: Follow up with carol@acme.io\nTicket #405: Approved by dave@initech.org\nTicket #406: Security review from eve@acme.io\nTicket #407: Support request from frank@globex.com",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-extract",
          type: "extract",
          position: { x: 330, y: 200 },
          data: {
            kind: "extract",
            label: "Extract Email",
            note: "Regex Preset: Email address (drops unmatched)",
            params: {
              ...defaultParams("extract"),
              mode: "regex",
              pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
              group: 0,
              caseSensitive: false,
              dropUnmatched: true,
            },
          },
        },
        {
          id: "tpl-case",
          type: "case",
          position: { x: 600, y: 200 },
          data: {
            kind: "case",
            label: "Lowercase Emails",
            params: { mode: "lower" },
          },
        },
        {
          id: "tpl-unmerge",
          type: "unmerge",
          position: { x: 850, y: 190 },
          data: {
            kind: "unmerge",
            label: "Split User @ Domain",
            note: "Output A = username, Output B = domain",
            params: { delimiter: "@", occurrence: "first", missingFallback: "" },
          },
        },
        {
          id: "tpl-out-users",
          type: "output",
          position: { x: 1130, y: 110 },
          data: {
            kind: "output",
            label: "Usernames (A)",
            params: { filename: "usernames.txt" },
          },
        },
        {
          id: "tpl-stats-domains",
          type: "stats",
          position: { x: 1130, y: 275 },
          data: {
            kind: "stats",
            label: "Domain Frequency",
            note: "Rank domains by ticket volume",
            params: {
              mode: "frequency",
              separator: ": ",
              includeLabels: true,
              caseSensitive: false,
            },
          },
        },
        {
          id: "tpl-out-domains",
          type: "output",
          position: { x: 1400, y: 275 },
          data: {
            kind: "output",
            label: "Top Domains (B)",
            params: { filename: "top-domains.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-extract", sourceHandle: null, targetHandle: null },
        { id: "e-2", source: "tpl-extract", target: "tpl-case", sourceHandle: null, targetHandle: null },
        { id: "e-3", source: "tpl-case", target: "tpl-unmerge", sourceHandle: null, targetHandle: null },
        { id: "e-4a", source: "tpl-unmerge", target: "tpl-out-users", sourceHandle: "a", targetHandle: null },
        { id: "e-4b", source: "tpl-unmerge", target: "tpl-stats-domains", sourceHandle: "b", targetHandle: null },
        { id: "e-5b", source: "tpl-stats-domains", target: "tpl-out-domains", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
  {
    id: "decode-base64-and-encode",
    name: "Decode Base64 & Escape HTML / URL",
    description: "Encode/Decode (Base64 → HTML Entities & URL %20)",
    createGraph: () => ({
      nodes: [
        {
          id: "tpl-input",
          type: "input",
          position: { x: 60, y: 195 },
          data: {
            kind: "input",
            label: "Base64 Payloads",
            note: "UTF-8 strings encoded in Base64",
            params: {
              ...defaultParams("input"),
              source: "text",
              text: "SGVsbG8gJiBXZWxjb21lIQ==\nU2VhcmNoOiBDKysgJiBSdXN0\nMTAwJSBDbGllbnQtU2lkZSA8QXBwPg==",
              inputType: "lines",
            },
          },
        },
        {
          id: "tpl-decode-b64",
          type: "encode",
          position: { x: 340, y: 195 },
          data: {
            kind: "encode",
            label: "Decode Base64",
            note: "Convert Base64 rows back to plain text",
            params: {
              format: "base64",
              direction: "decode",
            },
          },
        },
        {
          id: "tpl-encode-html",
          type: "encode",
          position: { x: 620, y: 110 },
          data: {
            kind: "encode",
            label: "HTML Entities",
            note: "Escape &, <, > for safe HTML embedding",
            params: {
              format: "html",
              direction: "encode",
            },
          },
        },
        {
          id: "tpl-out-html",
          type: "output",
          position: { x: 900, y: 110 },
          data: {
            kind: "output",
            label: "Safe HTML Rows",
            params: { filename: "safe-html.txt" },
          },
        },
        {
          id: "tpl-encode-url",
          type: "encode",
          position: { x: 620, y: 280 },
          data: {
            kind: "encode",
            label: "URL Encode",
            note: "Percent-encode for URL query strings",
            params: {
              format: "url",
              direction: "encode",
            },
          },
        },
        {
          id: "tpl-out-url",
          type: "output",
          position: { x: 900, y: 280 },
          data: {
            kind: "output",
            label: "URL-Encoded Rows",
            params: { filename: "url-encoded.txt" },
          },
        },
      ],
      edges: [
        { id: "e-1", source: "tpl-input", target: "tpl-decode-b64", sourceHandle: null, targetHandle: null },
        { id: "e-2a", source: "tpl-decode-b64", target: "tpl-encode-html", sourceHandle: null, targetHandle: null },
        { id: "e-3a", source: "tpl-encode-html", target: "tpl-out-html", sourceHandle: null, targetHandle: null },
        { id: "e-2b", source: "tpl-decode-b64", target: "tpl-encode-url", sourceHandle: null, targetHandle: null },
        { id: "e-3b", source: "tpl-encode-url", target: "tpl-out-url", sourceHandle: null, targetHandle: null },
      ],
    }),
  },
];


