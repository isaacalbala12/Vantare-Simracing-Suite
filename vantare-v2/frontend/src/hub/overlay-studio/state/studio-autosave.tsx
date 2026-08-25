import { useEffect, useRef } from "react";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { getStudioHotkey } from "./studio-hotkeys";
import { useStudioDocument } from "./studio-store";

export const STUDIO_AUTOSAVE_DELAY_MS = 300;

/**
 * Persistencia y atajos globales de la ruta productiva del Studio.
 *
 * El documento solo cambia cuando un comando queda confirmado (un drag, por
 * ejemplo, hace commit en pointerup), de modo que observar `document` conserva
 * el historial existente y evita guardar previews transitorias. El proveedor
 * serializa las peticiones y coalesce cualquier cambio ocurrido en vuelo.
 */
export function StudioAutosave(props: { delayMs?: number }): null {
  const { delayMs = STUDIO_AUTOSAVE_DELAY_MS } = props;
  const { document, dirty, saveState, save, undo, redo } = useStudioDocument();
  const lastAttemptedDocumentRef = useRef<ProfileDocumentV3 | null>(null);
  const conflictPausedRef = useRef(false);

  useEffect(() => {
    if (saveState === "conflict") {
      conflictPausedRef.current = true;
    } else if (saveState === "saved") {
      conflictPausedRef.current = false;
    }
  }, [saveState]);

  useEffect(() => {
    if (
      !dirty ||
      !document ||
      saveState === "saving" ||
      conflictPausedRef.current ||
      lastAttemptedDocumentRef.current === document
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAttemptedDocumentRef.current = document;
      void save();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, dirty, document, save, saveState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hotkey = getStudioHotkey(event);
      if (hotkey === "save") {
        event.preventDefault();
        void save();
        return;
      }
      if (hotkey === "undo") {
        event.preventDefault();
        undo();
        return;
      }
      if (hotkey === "redo") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, save, undo]);

  return null;
}
