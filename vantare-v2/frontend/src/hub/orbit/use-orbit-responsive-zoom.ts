import { useEffect } from "react";
import { isOrbitZoomFloored, resolveOrbitZoom } from "./orbit-zoom";

/**
 * Cadencia con la que se reescribe el factor mientras el usuario arrastra el
 * borde de la ventana. Escribir `zoom` en `<html>` invalida el layout **y** el
 * estilo del documento entero: a 60 Hz eso son ~14 ms de CPU por frame solo en
 * reescalar, y en WebView2 el arrastre se atasca varios segundos (D-R4-4).
 * A 120 ms el reescalado sigue leyéndose como continuo y el coste cae a ~1/7.
 */
const ORBIT_ZOOM_THROTTLE_MS = 120;

/**
 * Reposo tras el último `resize`: aquí se escribe el valor final (trailing) y
 * se levanta el modo «redimensionando». Debe ser mayor que el throttle para no
 * cortar la ráfaga por la mitad.
 */
const ORBIT_ZOOM_SETTLE_MS = 180;

/**
 * Aplica el escalado proporcional de Orbit mientras la shell está montada.
 *
 * El `zoom` va en `document.documentElement` a propósito, no en `.orbit-root`:
 * la paleta, el Select, el Drawer y los toasts se portalan a `document.body`,
 * fuera de la shell, y desde la raíz escalan igual que el resto sin tocar su
 * posicionamiento (Chromium ancla `position: fixed` al viewport real y escala
 * el contenido). Escalar solo `.orbit-root` los habría dejado a tamaño 1.
 *
 * `--orbit-zoom` se publica para que la CSS compense las unidades de viewport
 * (`100vh` bajo `zoom` se resuelve en px reales y luego se escala, así que la
 * shell pide `100vh / var(--orbit-zoom)` para acabar midiendo la ventana).
 *
 * Rendimiento (D-R4-4): el `resize` continuo no se atiende por frame sino con
 * throttling **leading + trailing**, y mientras dura la ráfaga se marca
 * `documentElement[data-orbit-resizing]` para que la CSS congele transiciones,
 * animaciones y `backdrop-filter` —los tres repintados caros de la shell—.
 */
export function useOrbitResponsiveZoom(): void {
  useEffect(() => {
    const root = document.documentElement;
    const style = root.style as CSSStyleDeclaration & { zoom?: string };
    let lastFactor = Number.NaN;
    let lastWriteAt = Number.NEGATIVE_INFINITY;
    let throttleTimer = 0;
    let settleTimer = 0;
    let resizing = false;

    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const write = () => {
      lastWriteAt = now();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      // Cuantizado a milésimas: por debajo de 0.001 el cambio no se ve y solo
      // sirve para invalidar el estilo del árbol entero en cada paso.
      const factor = Math.round(resolveOrbitZoom(viewport) * 1000) / 1000;
      if (factor !== lastFactor) {
        lastFactor = factor;
        // A factor 1 no se deja `zoom` escrito: así el modo normal es idéntico
        // al de antes de este cambio y no hay capa de composición extra.
        style.zoom = factor === 1 ? "" : String(factor);
        root.style.setProperty("--orbit-zoom", String(factor));
      }
      const floored = isOrbitZoomFloored(viewport);
      if (floored) {
        if (root.dataset.orbitZoomFloored !== "true") root.dataset.orbitZoomFloored = "true";
      } else if (root.dataset.orbitZoomFloored) {
        delete root.dataset.orbitZoomFloored;
      }
    };

    const clearThrottle = () => {
      if (!throttleTimer) return;
      window.clearTimeout(throttleTimer);
      throttleTimer = 0;
    };

    const settle = () => {
      settleTimer = 0;
      clearThrottle();
      write();
      resizing = false;
      delete root.dataset.orbitResizing;
    };

    const onResize = () => {
      if (!resizing) {
        resizing = true;
        root.dataset.orbitResizing = "true";
      }
      const elapsed = now() - lastWriteAt;
      if (elapsed >= ORBIT_ZOOM_THROTTLE_MS) {
        clearThrottle();
        write();
      } else if (!throttleTimer) {
        throttleTimer = window.setTimeout(() => {
          throttleTimer = 0;
          write();
        }, ORBIT_ZOOM_THROTTLE_MS - elapsed);
      }
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, ORBIT_ZOOM_SETTLE_MS);
    };

    write();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      clearThrottle();
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", onResize);
      style.zoom = "";
      root.style.removeProperty("--orbit-zoom");
      delete root.dataset.orbitZoomFloored;
      delete root.dataset.orbitResizing;
    };
  }, []);
}
