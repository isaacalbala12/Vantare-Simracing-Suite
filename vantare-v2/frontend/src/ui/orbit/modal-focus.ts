import { useCallback, useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalFocusOptions {
  /** Filtra controles ocultos (el cajón puede renderizar hijos con `display:none`). */
  visibleOnly?: boolean;
  /** `preventDefault` además de `stopPropagation` en `Escape`. */
  escapePreventDefault?: boolean;
}

/**
 * Comportamiento modal compartido por `Drawer` y `ConfirmDialog` (`08`): foco
 * al primer control al abrir, trampa de `Tab`, cierre con `Escape` y devolución
 * del foco al elemento que lo abrió.
 */
export function useModalFocus(
  panelRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  onDismiss: () => void,
  { visibleOnly = false, escapePreventDefault = false }: ModalFocusOptions = {},
): void {
  const restoreRef = useRef<HTMLElement | null>(null);

  const focusables = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    return visibleOnly
      ? nodes.filter((node) => node.offsetParent !== null || node === document.activeElement)
      : nodes;
  }, [panelRef, visibleOnly]);

  // Foco de entrada y devolución al cerrar.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    (focusables()[0] ?? panelRef.current)?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open, focusables, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (escapePreventDefault) event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss, focusables, escapePreventDefault, panelRef]);
}
