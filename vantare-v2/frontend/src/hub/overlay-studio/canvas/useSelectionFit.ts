import { useCallback, useEffect, useLayoutEffect } from "react";
import { measureWidgetContentBox } from "./widget-content-box";

/**
 * Cine el envoltorio de seleccion —marco punteado, ocho tiradores y ancla de
 * la etiqueta— a la caja realmente pintada por el widget (`briefing 04 · A1`).
 *
 * Sin esto el envoltorio hereda `inset: 0` del marco, que es la caja del
 * documento: en cuanto el widget pinta menos de lo que mide su layout (una
 * tabla con 5 filas en una caja de 540 px, un diseno con proporcion propia) el
 * marco queda flotando alrededor de nada.
 *
 * Se remide con `ResizeObserver` sobre el marco y sobre lo que pinta dentro,
 * porque el contenido cambia con la telemetria y con el diseno aplicado, no
 * solo con el layout.
 */
export function useSelectionFit(input: {
  enabled: boolean;
  frameRef: React.RefObject<HTMLElement | null>;
  selectionRef: React.RefObject<HTMLElement | null>;
  /** Una clave estable de layout, diseno y contenido fuerza una remedida. */
  dependencyKey: string;
}): void {
  const { enabled, frameRef, selectionRef, dependencyKey } = input;

  const apply = useCallback(() => {
    const selection = selectionRef.current;
    if (!selection) return;

    const clear = () => {
      selection.style.left = "";
      selection.style.top = "";
      selection.style.width = "";
      selection.style.height = "";
      selection.removeAttribute("data-fitted");
    };

    const frame = frameRef.current;
    if (!enabled || !frame) {
      clear();
      return;
    }
    const box = measureWidgetContentBox(frame);
    if (!box) {
      clear();
      return;
    }
    selection.style.left = `${box.x}px`;
    selection.style.top = `${box.y}px`;
    selection.style.width = `${box.w}px`;
    selection.style.height = `${box.h}px`;
    selection.dataset.fitted = "true";
  }, [enabled, frameRef, selectionRef]);

  useLayoutEffect(() => {
    apply();
    // Una segunda pasada en el siguiente frame: fuentes y telemetria pueden
    // cambiar el alto del contenido despues del primer layout.
    if (typeof requestAnimationFrame !== "function") return;
    const raf = requestAnimationFrame(() => apply());
    return () => cancelAnimationFrame(raf);
  }, [apply, dependencyKey]);

  useEffect(() => {
    if (!enabled) return;
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => apply());
    observer.observe(frame);
    const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
    if (viewport) {
      observer.observe(viewport);
      for (const child of Array.from(viewport.children)) {
        if (child instanceof HTMLElement) observer.observe(child);
      }
    }
    return () => observer.disconnect();
  }, [apply, enabled, frameRef, dependencyKey]);
}
