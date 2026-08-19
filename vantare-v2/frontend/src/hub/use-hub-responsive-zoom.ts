import { useEffect } from "react";
import { applyHubZoom, clearHubZoom, resolveHubZoomFactor } from "./hub-zoom";

/**
 * Zoom responsive de la shell V52 (amplía por encima de 1080 px de alto).
 *
 * `enabled` existe porque Orbit tiene su propio escalado (`useOrbitResponsiveZoom`,
 * D-R4-3) y ambos escriben `documentElement.style.zoom`: con Orbit activo este
 * se apaga para que no se pisen.
 */
export function useHubResponsiveZoom(options?: { enabled?: boolean }): void {
  const enabled = options?.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const host = document.documentElement;
    const apply = () => applyHubZoom(host, resolveHubZoomFactor(window.innerHeight));
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      clearHubZoom(host);
    };
  }, [enabled]);
}
