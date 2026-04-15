import { useEffect, useRef } from "react";
import { hasMeaningfulSessionData } from "../utils/helpers";
import {
  clearSavedStateFromStorage,
  loadSavedSessionFromStorage,
  persistSessionToStorage,
} from "../utils/storage";

export function usePersistedSession({
  enabled,
  buildState,
  onLoad,
  onModeChange,
  debounceMs = 700,
}) {
  const pendingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { mode, saved } = await loadSavedSessionFromStorage();
        if (cancelled) return;

        pendingRef.current = saved;
        onModeChange?.(mode);
        onLoad?.(saved, mode);
      } catch (error) {
        console.error("Failed to load saved session:", error);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []); // intentional one-time load

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setTimeout(async () => {
      try {
        const data = buildState();

        if (!hasMeaningfulSessionData(data)) {
          await clearSavedStateFromStorage();
          onModeChange?.("localStorage");
          return;
        }

        const mode = await persistSessionToStorage(data);
        onModeChange?.(mode);
      } catch (error) {
        console.error("Failed to persist session:", error);
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [enabled, buildState, onModeChange, debounceMs]);

  return {
    pendingRestoreRef: pendingRef,
  };
}
