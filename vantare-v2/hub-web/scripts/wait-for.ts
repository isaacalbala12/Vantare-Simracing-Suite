import { setTimeout } from "node:timers/promises";
import type { Locator } from "playwright-core";
// Bounded polling of external process/file state; no fixed startup sleeps.
export async function until(
  predicate: () => boolean | Promise<boolean>,
  timeout: number,
  description: string,
) {
  const deadline = performance.now() + timeout;
  do {
    if (await predicate()) return;
    await setTimeout(50);
  } while (performance.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

// Locator.waitFor reintenta con esperas que crecen hasta 500 ms y llega a tardar
// ~400 ms más de lo que tarda el elemento en estar visible; este sondeo corto
// espera lo mismo (visible, un solo elemento) con el mismo plazo, sin ese lastre.
export async function visible(locator: Locator, timeout = 20000) {
  const deadline = performance.now() + timeout;
  do {
    if (await locator.isVisible()) return;
    await setTimeout(20);
  } while (performance.now() < deadline);
  throw new Error(`Timed out: visible ${locator}`);
}

// Espera a que el foco del teclado esté en el elemento del locator
// (`document.activeElement`), con el mismo plazo y sondeo que `visible`. Un menú
// se ve antes de tener el foco: la tecla que llega entre las dos cosas se pierde
// (#2721). `evaluateAll` no espera ni lanza si el elemento aún no existe: la causa
// de un fallo sale en el mensaje, con la descripción del locator.
export async function focused(locator: Locator, timeout = 20000) {
  const deadline = performance.now() + timeout;
  do {
    if (
      await locator.evaluateAll(
        (nodes) => nodes.length === 1 && nodes[0] === document.activeElement,
      )
    )
      return;
    await setTimeout(20);
  } while (performance.now() < deadline);
  throw new Error(`Timed out: focused ${locator}`);
}

// Pulsa cuando el elemento ya es visible; así el clic no entra en el reintento
// con esperas largas de Playwright si la pantalla aún está cargando.
export async function press(locator: Locator, timeout = 20000) {
  await visible(locator, timeout);
  await locator.click({ timeout });
}

// Espera a que el elemento esté habilitado (sin `disabled` ni `aria-disabled`), con el
// mismo plazo y sondeo que `visible`. Un botón se ve antes de poder usarse: mientras el
// host contesta a la petición anterior sigue deshabilitado y la tecla que llega se
// pierde. (`click` ya espera a que esté habilitado; `press` de una tecla no.)
export async function enabled(locator: Locator, timeout = 20000) {
  const deadline = performance.now() + timeout;
  do {
    if (await locator.isEnabled()) return;
    await setTimeout(20);
  } while (performance.now() < deadline);
  throw new Error(`Timed out: enabled ${locator}`);
}

// Lo mismo con una tecla: espera a que el elemento sea visible y esté habilitado, y
// luego la pulsa.
export async function pressKey(locator: Locator, key: string, timeout = 20000) {
  await visible(locator, timeout);
  await enabled(locator, timeout);
  await locator.press(key, { timeout });
}
