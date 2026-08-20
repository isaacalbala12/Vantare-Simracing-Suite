/**
 * Determinismo visual para los harnesses Orbit (ISA-380).
 *
 * Las capturas de los harnesses `orbit-*-visual.mjs` caían a veces a mitad de
 * una animación de entrada (`orbit-tab-in`, `orbit-tc-in`, `orbit-strategy-in`,
 * el fundido de la paleta) o sobre un pulso infinito (`orbit-pill-pulse`,
 * `orbit-btn-loading`, el shimmer del launcher). El resultado era un diff de
 * hasta un tercio de la imagen entre dos pasadas idénticas.
 *
 * Este módulo congela el movimiento en el navegador del harness —no en la app—
 * de tres maneras complementarias:
 *
 *  1. `reducedMotion: 'reduce'`, que es el mismo interruptor que usa el ajuste
 *     «reducir animaciones». Así el harness ejercita el camino que un usuario
 *     con movimiento reducido ve de verdad.
 *  2. Una hoja inyectada antes de que corra nada de la página que pone
 *     `animation: none` y `transition: none` en todo, incluidos pseudoelementos.
 *     Es el cinturón sobre los tirantes: cubre cualquier animación que se
 *     olvide de mirar `prefers-reduced-motion`.
 *  3. `settle()`, que espera a las fuentes, remata cualquier animación viva y
 *     deja pasar dos frames antes de disparar la captura.
 */

const STILL_CSS = `
*, *::before, *::after {
  animation-delay: -0.0001s !important;
  animation-duration: 0.0001s !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
`;

/**
 * Opciones de `browser.newPage()` con el movimiento reducido activado.
 * Se conserva todo lo que traiga el harness (viewport, locale, timezone…).
 */
export const stillPageOptions = (options = {}) => ({
  reducedMotion: "reduce",
  ...options,
});

/**
 * Abre una página lista para capturar: movimiento reducido + hoja de congelado
 * inyectada antes de que la app monte, de modo que ni la animación de entrada
 * llega a arrancar.
 */
export async function stillPage(browser, options = {}) {
  const page = await browser.newPage(stillPageOptions(options));
  await page.addInitScript((css) => {
    const install = () => {
      if (document.getElementById("orbit-still-motion")) return;
      const style = document.createElement("style");
      style.id = "orbit-still-motion";
      style.textContent = css;
      (document.head ?? document.documentElement).append(style);
    };
    if (document.documentElement) install();
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }, STILL_CSS);
  return page;
}

/**
 * Deja la página en un estado estable para capturar: fuentes resueltas,
 * animaciones rematadas y dos frames de margen.
 */
export async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
    );
  });
}

/**
 * Saca la región de toasts de las capturas.
 *
 * Los toasts se cierran solos por temporizador, así que cuántos hay en pantalla
 * depende de cuánto tardó el harness en llegar hasta aquí: dos pasadas de la
 * misma escena pueden pillar tres, uno o ninguno, y encima tapan el contenido
 * que la captura venía a auditar. Se usa en los harnesses donde el toast es un
 * efecto colateral del flujo; el del kit, que sí audita la pila de toasts, y el
 * del Testing Center, que comprueba su texto, no lo llaman.
 *
 * Se oculta con CSS en vez de quitar los nodos: son nodos de React, y
 * arrancarlos por debajo rompe la reconciliación y desmonta media vista en
 * cuanto llega el siguiente toast.
 */
export async function hideToasts(page) {
  await page.evaluate(() => {
    if (document.getElementById("orbit-hide-toasts")) return;
    const style = document.createElement("style");
    style.id = "orbit-hide-toasts";
    style.textContent = ".orbit-toast-region, .orbit-toast { visibility: hidden !important; }";
    document.head.append(style);
  });
}
