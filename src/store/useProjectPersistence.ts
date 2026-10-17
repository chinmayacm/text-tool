import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "./useGraphStore";
import { createProjectSnapshot, loadLocalProject, saveLocalProject } from "./projectPersistence";

export type ProjectSaveStatus = "loading" | "ready" | "saved" | "saving" | "error";

export function useProjectPersistence() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ProjectSaveStatus>("loading");
  const flushSave = useRef<() => Promise<void>>(async () => undefined);
  const restoreProject = useGraphStore((state) => state.restoreProject);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let unsubscribe: (() => void) | undefined;
    let saveQueue = Promise.resolve();

    const saveNow = (): Promise<void> => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      const snapshot = createProjectSnapshot(useGraphStore.getState());
      saveQueue = saveQueue
        .then(() => saveLocalProject(snapshot))
        .then(() => {
          if (!disposed) setStatus("saved");
        })
        .catch(() => {
          if (!disposed) setStatus("error");
        });
      return saveQueue;
    };
    flushSave.current = saveNow;

    const scheduleSave = () => {
      if (disposed) return;
      setStatus("saving");
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(saveNow, 600);
    };

    const flushOnPageHide = () => saveNow();

    async function restoreAndSubscribe() {
      try {
        const project = await loadLocalProject();
        if (disposed) return;
        if (project) restoreProject(project);
        setStatus(project ? "saved" : "ready");
      } catch {
        if (disposed) return;
        setStatus("error");
      }
      if (disposed) return;
      setReady(true);
      unsubscribe = useGraphStore.subscribe((state, previous) => {
        if (
          state.nodes !== previous.nodes ||
          state.edges !== previous.edges ||
          state.viewport !== previous.viewport ||
          state.previewRowLimitMode !== previous.previewRowLimitMode ||
          state.previewRowCustom !== previous.previewRowCustom ||
          state.previewCharLimitMode !== previous.previewCharLimitMode ||
          state.previewCharCustom !== previous.previewCharCustom
        ) {
          scheduleSave();
        }
      });
      window.addEventListener("pagehide", flushOnPageHide);
    }

    void restoreAndSubscribe();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener("pagehide", flushOnPageHide);
      flushSave.current = async () => undefined;
    };
  }, [restoreProject]);

  async function startFresh(): Promise<void> {
    useGraphStore.getState().resetProject();
    await flushSave.current();
  }

  return { ready, status, startFresh };
}
