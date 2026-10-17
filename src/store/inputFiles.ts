const files = new Map<string, File>();

export function setInputFile(id: string, file: File): void {
  files.set(id, file);
}

export function getInputFile(id: string): File | undefined {
  return files.get(id);
}

export function forgetInputFile(id: string): void {
  files.delete(id);
}

export function copyInputFile(fromId: string, toId: string): void {
  const file = files.get(fromId);
  if (file) files.set(toId, file);
}

export function replaceInputFiles(entries: Array<{ nodeId: string; file: File }>): void {
  files.clear();
  for (const { nodeId, file } of entries) files.set(nodeId, file);
}
