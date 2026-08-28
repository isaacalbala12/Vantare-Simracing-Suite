import { useEffect } from "react";
import { ORBIT_KEYS, orbitStore } from "./orbit-store";
import {
  appZoomShortcut,
  DEFAULT_APP_ZOOM,
  getStoredAppZoom,
  nextAppZoom,
  setAppZoom,
  subscribeAppZoom,
  type AppZoom,
} from "./app-zoom";
import { orbitZoomRequiresScroll, resolveOrbitZoom } from "./orbit-zoom";

/**
 * Reposo tras el último `resize`: aquí se levanta el modo «redimensionando».
 * No retrasa el escalado (que ya va por frame): solo evita que las
 * transiciones vuelvan a dispararse entre dos pasos del mismo gesto.
 */
const ORBIT_RESIZE_SETTLE_MS = 120;

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
 * Rendimiento (D-R4-5): el factor se escribe **una vez por frame**, coalescido
 * con `requestAnimationFrame`. La medición en la app real (Wails/WebView2,
 * arrastre por el bucle modal de Windows, doc `real-resize-profile.md`) mostró
 * que el coste no está aquí: durante un gesto de 700 ms el hilo principal se
 * mantiene a 60 Hz clavados (p95 16.8 ms, cero long tasks) y layout+estilo
 * suman ~250 ms repartidos en 4,6 s. Lo que se percibía como «va lento» era el
 * throttling de 120 ms de D-R4-4: aplicaba solo **4** escalones para 38-40
 * eventos de `resize`, dejando el contenido descuadrado respecto al marco unos
 * 19 frames y cuadrándolo 50-99 ms *después* de soltar. Escribir por frame
 * elimina el desfase sin acercarse al presupuesto de frame.
 *
 * `data-orbit-resizing` se mantiene: congela transiciones y `backdrop-filter`
 * durante la ráfaga, que si no se re-disparan en cada escalón.
 */
export function useOrbitResponsiveZoom(): void {
  useEffect(() => {
    // Interruptor de diagnostico (`vantare.v03orbit.zoomOff=1`): permite medir
    // el redimensionado real de la app con y sin escalado sin recompilar.
    if (orbitStore.get(ORBIT_KEYS.zoomOff) === "1") return;
    const root = document.documentElement;
    const style = root.style as CSSStyleDeclaration & { zoom?: string };
    let lastFactor = Number.NaN;
    let scheduled = false;
    let frame = 0;
    let settleTimer = 0;
    let resizing = false;
    let userZoom: AppZoom = getStoredAppZoom();

    const write = () => {
      scheduled = false;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      // Cuantizado a milésimas: por debajo de 0.001 el cambio no se ve y solo
      // sirve para invalidar el estilo del árbol entero en cada paso.
      const factor = Math.round(resolveOrbitZoom(viewport) * userZoom * 1000) / 1000;
      if (factor !== lastFactor) {
        lastFactor = factor;
        // A factor 1 no se deja `zoom` escrito: así el modo normal es idéntico
        // al de antes de este cambio y no hay capa de composición extra.
        style.zoom = factor === 1 ? "" : String(factor);
        root.style.setProperty("--orbit-zoom", String(factor));
      }
      const floored = orbitZoomRequiresScroll(viewport, factor);
      if (floored) {
        if (root.dataset.orbitZoomFloored !== "true") root.dataset.orbitZoomFloored = "true";
      } else if (root.dataset.orbitZoomFloored) {
        delete root.dataset.orbitZoomFloored;
      }
    };

    const onZoomShortcut = (event: KeyboardEvent) => {
      const shortcut = appZoomShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      const next =
        shortcut === "reset"
          ? DEFAULT_APP_ZOOM
          : nextAppZoom(userZoom, shortcut === "increase" ? 1 : -1);
      setAppZoom(next);
    };

    const unsubscribeZoom = subscribeAppZoom((next) => {
      userZoom = next;
      write();
    });

    const settle = () => {
      settleTimer = 0;
      resizing = false;
      delete root.dataset.orbitResizing;
    };

    const onResize = () => {
      if (!resizing) {
        resizing = true;
        root.dataset.orbitResizing = "true";
      }
      // Un solo escalado por frame: varios `resize` dentro del mismo frame se
      // funden en la escritura que ya está encolada.
      if (!scheduled) {
        // `scheduled` se marca *antes* de encolar: si el frame se ejecutase de
        // forma sincrona, la bandera ya estaria puesta y el propio `write` la
        // devolveria a false sin dejar el gesto colgado.
        scheduled = true;
        frame = window.requestAnimationFrame(write);
      }
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, ORBIT_RESIZE_SETTLE_MS);
    };

    write();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("keydown", onZoomShortcut);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onZoomShortcut);
      unsubscribeZoom();
      style.zoom = "";
      root.style.removeProperty("--orbit-zoom");
      delete root.dataset.orbitZoomFloored;
      delete root.dataset.orbitResizing;
    };
  }, []);
}
