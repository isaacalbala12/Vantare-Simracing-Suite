import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioCommand } from "../../hub/overlay-studio/state/studio-command";
import type { StudioSaveResult } from "../../hub/overlay-studio/state/studio-profile-client";

export type InPlaceAutosavePause = "error" | "conflict" | null;

export type InPlaceAutosaveController = {
  dispatch(command: StudioCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  retry(): void;
  paused: InPlaceAutosavePause;
  pending: boolean;
};

export type UseInplaceAutosaveInput = {
  dispatch(command: StudioCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  save(): Promise<StudioSaveResult>;
  interactionActive: boolean;
  debounceMs?: number;
};

const PROPERTY_DEBOUNCE_MS = 300;

/**
 * Autosave del modo edicion in-place: se dispara por comandos aceptados (nunca
 * por dirty, que puede nacer de migraciones al cargar), con debounce para las
 * propiedades, inmediato para layout/undo/redo, una sola peticion en vuelo y
 * coalescing de cambios posteriores. Error pausa con Retry; conflicto pausa y
 * exige recarga explicita (nunca reintenta una revision conflictiva).
 */
export function useInplaceAutosave(input: UseInplaceAutosaveInput): InPlaceAutosaveController {
  const { dispatch, undo, redo, debounceMs = PROPERTY_DEBOUNCE_MS } = input;
  const inputRef = useRef(input);
  const [paused, setPaused] = useState<InPlaceAutosavePause>(null);
  const [pending, setPending] = useState(false);
  const inFlightRef = useRef(false);
  const coalescedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef<InPlaceAutosavePause>(null);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const updatePaused = useCallback((next: InPlaceAutosavePause) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const runSave = useCallback(async () => {
    if (inFlightRef.current || inputRef.current.interactionActive) {
      coalescedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setPending(true);
    try {
      const result = await inputRef.current.save();
      if (result.status === "saved") {
        updatePaused(null);
      } else if (result.status === "error") {
        updatePaused("error");
      } else {
        updatePaused("conflict");
      }
    } finally {
      inFlightRef.current = false;
      setPending(false);
      if (coalescedRef.current && pausedRef.current === null) {
        coalescedRef.current = false;
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void runSave();
        }, 0);
      }
    }
  }, [updatePaused]);

  const scheduleSave = useCallback(
    (immediate: boolean) => {
      if (pausedRef.current !== null) {
        return;
      }
      clearTimer();
      if (immediate) {
        void runSave();
        return;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runSave();
      }, debounceMs);
    },
    [clearTimer, debounceMs, runSave],
  );

  const dispatchChecked = useCallback(
    (command: StudioCommand): boolean => {
      const changed = dispatch(command);
      if (changed) {
        const immediate = command.type === "widget/layout";
        scheduleSave(immediate);
      }
      return changed;
    },
    [dispatch, scheduleSave],
  );

  const undoChecked = useCallback((): boolean => {
    const changed = undo();
    if (changed) {
      scheduleSave(true);
    }
    return changed;
  }, [redo, scheduleSave, undo]);

  const redoChecked = useCallback((): boolean => {
    const changed = redo();
    if (changed) {
      scheduleSave(true);
    }
    return changed;
  }, [redo, scheduleSave]);

  const retry = useCallback(() => {
    if (pausedRef.current !== "error") {
      return;
    }
    updatePaused(null);
    void runSave();
  }, [runSave, updatePaused]);

  return {
    dispatch: dispatchChecked,
    undo: undoChecked,
    redo: redoChecked,
    retry,
    paused,
    pending,
  };
}
