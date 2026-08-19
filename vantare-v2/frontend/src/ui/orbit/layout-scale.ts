/**
 * Conversión de coordenadas cuando la shell Orbit está escalada (D-R4-3).
 *
 * El escalado pone `zoom` en `<html>`, así que conviven dos espacios:
 * `getBoundingClientRect()` y `window.innerWidth/Height` devuelven **px reales**
 * (los de la ventana), mientras que todo lo que se pinta dentro del documento
 * —incluidas las capas `position: fixed` portaladas a `document.body`— se
 * maqueta en **px de maquetación**, que son los reales divididos por el factor.
 *
 * Cualquier capa flotante que se posicione a partir de un rect medido tiene que
 * hacer esa conversión o aparecerá desplazada en cuanto el factor no sea 1.
 */

/** Factor de escala vigente (1 cuando la shell no está escalada). */
export function orbitZoomFactor(): number {
  if (typeof document === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--orbit-zoom");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Pasa una medida en px reales al espacio de maquetación del documento. */
export function toLayoutPx(value: number, factor = orbitZoomFactor()): number {
  return value / factor;
}

/** Viewport en px de maquetación: con lo que se compara un rect ya convertido. */
export function layoutViewport(factor = orbitZoomFactor()): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth / factor, height: window.innerHeight / factor };
}
