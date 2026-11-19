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

// Pulsa cuando el elemento ya es visible; así el clic no entra en el reintento
// con esperas largas de Playwright si la pantalla aún está cargando.
export async function press(locator: Locator, timeout = 20000) {
  await visible(locator, timeout);
  await locator.click({ timeout });
}
