import type { Edge, Node, Viewport } from "@xyflow/react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { NodeData, OperationKind } from "../types";
import { getInputFile } from "./inputFiles.ts";

const DATABASE_NAME = "texttool-projects";
const DATABASE_VERSION = 1;
const STORE_NAME = "projects";
const PROJECT_KEY = "current";
const PROJECT_FORMAT = "texttool-project";
const PROJECT_VERSION = 1;
type ArchiveManifest = Omit<ProjectSnapshot, "files"> & {
  attachments: Array<{ nodeId: string; name: string; type: string; path: string }>;
};

type FlowNode = Node<NodeData<OperationKind>>;

export type ProjectAttachment = {
  nodeId: string;
  name: string;
  type: string;
  blob: Blob;
};

export type ProjectSnapshot = {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  savedAt: number;
  nodes: FlowNode[];
  edges: Edge[];
  viewport: Viewport | null;
  preview: {
    rowMode: "5" | "10" | "50" | "custom" | "all";
    rowCustom: number;
    charMode: "100" | "500" | "1000" | "custom" | "all";
    charCustom: number;
  };
  files: ProjectAttachment[];
};

type SnapshotSource = Pick<
  ProjectSnapshot,
  "nodes" | "edges" | "viewport"
> & {
  previewRowLimitMode: ProjectSnapshot["preview"]["rowMode"];
  previewRowCustom: number;
  previewCharLimitMode: ProjectSnapshot["preview"]["charMode"];
  previewCharCustom: number;
};

let databasePromise: Promise<IDBDatabase> | undefined;

export function createProjectSnapshot(state: SnapshotSource): ProjectSnapshot {
  const files: ProjectAttachment[] = [];
  for (const node of state.nodes) {
    if (node.data.kind !== "input") continue;
    const file = getInputFile(node.id);
    if (!file) continue;
    files.push({ nodeId: node.id, name: file.name, type: file.type, blob: file });
  }

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: Date.now(),
    nodes: state.nodes,
    edges: state.edges,
    viewport: state.viewport,
    preview: {
      rowMode: state.previewRowLimitMode,
      rowCustom: state.previewRowCustom,
      charMode: state.previewCharLimitMode,
      charCustom: state.previewCharCustom,
    },
    files,
  };
}

export async function loadLocalProject(): Promise<ProjectSnapshot | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(PROJECT_KEY);
    request.onsuccess = () => resolve(request.result ? validateProject(request.result) : null);
    request.onerror = () => reject(request.error ?? new Error("Could not load the local project."));
  });
}

export async function saveLocalProject(project: ProjectSnapshot): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project, PROJECT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the local project."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local project save was canceled."));
  });
}

export async function createProjectArchive(project: ProjectSnapshot): Promise<Blob> {
  const attachments: Array<Omit<ProjectAttachment, "blob"> & { path: string }> = [];
  const archive: Record<string, Uint8Array> = {};

  for (const [index, attachment] of project.files.entries()) {
    const path = `files/attachment-${index}`;
    attachments.push({
      nodeId: attachment.nodeId,
      name: attachment.name,
      type: attachment.type,
      path,
    });
    archive[path] = new Uint8Array(await attachment.blob.arrayBuffer());
  }
  archive["project.json"] = strToU8(JSON.stringify({ ...project, files: undefined, attachments }));
  return new Blob([zipSync(archive, { level: 0 })], { type: "application/vnd.texttool.project+zip" });
}

export async function readProjectArchive(file: Blob): Promise<ProjectSnapshot> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifestFile = entries["project.json"];
  if (!manifestFile) throw new Error("This file does not contain a TextTool project.");

  const raw: unknown = JSON.parse(strFromU8(manifestFile));
  if (!isProjectManifest(raw)) throw new Error("The project file is invalid or uses an unsupported version.");
  const files: ProjectAttachment[] = raw.attachments.map((attachment) => {
    const content = entries[attachment.path];
    if (!content) throw new Error(`The project is missing ${attachment.name}.`);
    return {
      nodeId: attachment.nodeId,
      name: attachment.name,
      type: attachment.type,
      blob: new Blob([content], { type: attachment.type }),
    };
  });

  const { attachments: _attachments, ...project } = raw;
  return { ...project, files };
}

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("Local browser storage is unavailable."));
  if (!databasePromise) {
    const requestPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open local browser storage."));
      request.onblocked = () => reject(new Error("Local browser storage is blocked by another tab."));
    });
    databasePromise = requestPromise.catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function validateProject(value: unknown): ProjectSnapshot {
  if (!isStoredProject(value)) throw new Error("The saved local project is invalid or unsupported.");
  return value;
}

function isProjectBase(value: unknown): value is Omit<ProjectSnapshot, "files"> {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectSnapshot>;
  return (
    project.format === PROJECT_FORMAT &&
    project.version === PROJECT_VERSION &&
    Array.isArray(project.nodes) &&
    Array.isArray(project.edges) &&
    project.preview !== undefined
  );
}

function isProjectManifest(value: unknown): value is ArchiveManifest {
  if (!isProjectBase(value)) return false;
  const attachments = (value as { attachments?: unknown }).attachments;
  return Array.isArray(attachments) && attachments.every(
    (attachment) =>
      attachment &&
      typeof attachment.nodeId === "string" &&
      typeof attachment.name === "string" &&
      typeof attachment.type === "string" &&
      typeof attachment.path === "string"
  );
}

function isStoredProject(value: unknown): value is ProjectSnapshot {
  if (!isProjectBase(value)) return false;
  const files = (value as { files?: unknown }).files;
  return Array.isArray(files) && files.every(
    (file) =>
      file &&
      typeof file.nodeId === "string" &&
      typeof file.name === "string" &&
      typeof file.type === "string" &&
      file.blob instanceof Blob
  );
}
