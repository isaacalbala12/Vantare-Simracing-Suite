/**
 * Escalado proporcional de la shell Orbit (D-R4-3).
 *
 * La shell está calibrada a 1920×1080 y declara un suelo duro de 1180 px de
 * ancho (`.orbit-root { min-width }`, doc 03 § 3.1). Por debajo de ese suelo la
 * ventana recortaba los paneles por la derecha: es lo que se veía al reducir la
 * app de escritorio a ~870×780.
 *
 * Orden de respuesta (decidido en D-R4-3): **primero se pliega, después se
 * escala**. Las reglas de plegado (columna auto-plegada ≤ 1152 px, Inicio
 * compacto ≤ 940 px de alto, ≤ 790 px de alto) viven en media queries y en
 * `AUTO_COLLAPSE_WIDTH`, y todas leen el viewport **real** — Chromium no ajusta
 * las media queries al `zoom` del documento, así que CSS y JS ven lo mismo y no
 * se contradicen. El escalado solo entra por debajo de los *suelos posteriores
 * al plegado*: 1180 px de ancho y 790 px de alto (el último escalón de 3.7).
 * Así nunca se escala una ventana que todavía podía resolverse plegando.
 */

/** Ancho mínimo de diseño ya plegado (`.orbit-root { min-width: 1180px }`). */
export const ORBIT_REF_WIDTH = 1180;

/** Alto mínimo de diseño ya compactado (último escalón de doc 03 § 3.7). */
export const ORBIT_REF_HEIGHT = 790;

/**
 * Suelo del factor: por debajo la UI sería ilegible. A partir de aquí se deja
 * de escalar y el contenedor de la shell desplaza internamente en vez de
 * recortar (≈ 708×474 px de ventana).
 */
export const ORBIT_ZOOM_FLOOR = 0.6;

/** Nunca se amplía: a 1920×1080 y por encima el factor es exactamente 1. */
export const ORBIT_ZOOM_CEILING = 1;

/** Viewport real a partir del cual el contenido puede ensancharse (21:9 / 32:9). */
export const ORBIT_ULTRAWIDE_WIDTH = 2200;

/** Tope de contenido calibrado (doc 03 § 3.5). */
export const ORBIT_CONTENT_MAX = 1508;

/** Tope de contenido en ultrapanorámicas. */
export const ORBIT_CONTENT_MAX_ULTRAWIDE = 1760;

export type OrbitViewport = { width: number; height: number };

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Factor de escala de la shell: `min(w/1180, h/790, 1)` con suelo 0.6.
 *
 * Devuelve 1 ante medidas no válidas (SSR, jsdom sin layout): no escalar es
 * siempre el estado seguro.
 */
export function resolveOrbitZoom(viewport: OrbitViewport): number {
  const { width, height } = viewport;
  if (!finitePositive(width) || !finitePositive(height)) return ORBIT_ZOOM_CEILING;
  const raw = Math.min(width / ORBIT_REF_WIDTH, height / ORBIT_REF_HEIGHT);
  return Math.min(Math.max(raw, ORBIT_ZOOM_FLOOR), ORBIT_ZOOM_CEILING);
}

/**
 * `true` cuando la ventana es tan pequeña que el factor ha tocado el suelo: la
 * shell ya no cabe entera ni escalada y el contenedor pasa a desplazar.
 */
export function isOrbitZoomFloored(viewport: OrbitViewport): boolean {
  const { width, height } = viewport;
  if (!finitePositive(width) || !finitePositive(height)) return false;
  const raw = Math.min(width / ORBIT_REF_WIDTH, height / ORBIT_REF_HEIGHT);
  return raw < ORBIT_ZOOM_FLOOR;
}

/**
 * Tope de anchura del contenido del workspace. El valor calibrado es 1508 px;
 * en ultrapanorámicas (≥ 2200 px reales, o sea 21:9 en adelante) sube a 1760 px
 * para no desperdiciar el ancho, que es el mayor escalón que mantiene la
 * longitud de línea legible y las proporciones de las rejillas del diseño.
 * El Studio queda exento: su lienzo 16:9 aprovecha todo el ancho disponible.
 */
export function resolveOrbitContentMax(width: number): number {
  if (!finitePositive(width)) return ORBIT_CONTENT_MAX;
  return width >= ORBIT_ULTRAWIDE_WIDTH ? ORBIT_CONTENT_MAX_ULTRAWIDE : ORBIT_CONTENT_MAX;
}
