import type { Edge, Node } from "@xyflow/react";
import { defaultParams, type NodeData, type OperationKind } from "./types";

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
];


