import { useEffect } from "react";
import { isOrbitZoomFloored, resolveOrbitZoom } from "./orbit-zoom";

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
 */
export function useOrbitResponsiveZoom(): void {
  useEffect(() => {
    const root = document.documentElement;
    const style = root.style as CSSStyleDeclaration & { zoom?: string };
    let frame = 0;

    const apply = () => {
      frame = 0;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const factor = resolveOrbitZoom(viewport);
      // A factor 1 no se deja `zoom` escrito: así el modo normal es idéntico al
      // de antes de este cambio y no hay capa de composición extra.
      style.zoom = factor === 1 ? "" : String(factor);
      root.style.setProperty("--orbit-zoom", String(factor));
      if (isOrbitZoomFloored(viewport)) {
        root.dataset.orbitZoomFloored = "true";
      } else {
        delete root.dataset.orbitZoomFloored;
      }
    };

    // rAF: el resize de una ventana de escritorio dispara decenas de eventos por
    // segundo y solo interesa el último estado antes de pintar.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      style.zoom = "";
      root.style.removeProperty("--orbit-zoom");
      delete root.dataset.orbitZoomFloored;
    };
  }, []);
}
