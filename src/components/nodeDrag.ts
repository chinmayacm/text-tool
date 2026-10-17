import type { OperationKind } from "../types";

let activeKind: OperationKind | null = null;

export function setPaletteDragKind(kind: OperationKind | null): void {
  activeKind = kind;
}

export function getPaletteDragKind(): OperationKind | null {
  return activeKind;
}