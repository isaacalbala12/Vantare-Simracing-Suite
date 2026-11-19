import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";

// axe en modo clásico (`setLegacyMode(true)`): mismas reglas y mismo contexto,
// pero el análisis corre dentro de la página sin el viaje de resultados
// parciales de AxeBuilder (~0,45 s menos por escena). A cambio, no entra en
// iframes ni en marcos. Esta guarda comprueba, antes de cada análisis, que el
// contexto no contiene ninguno (ni sombras abiertas, que tampoco se dan aquí)
// y falla si aparece alguno, en vez de dar por buena una escena a medio mirar.
export async function axeClassic(
  page: Page,
  include: string[],
  exclude: string[] = [],
) {
  const hidden = await page.evaluate((selectors) => {
    const found: string[] = [];
    for (const selector of selectors)
      for (const root of document.querySelectorAll(selector))
        for (const node of [root, ...root.querySelectorAll("*")])
          if (
            node.shadowRoot ||
            ["IFRAME", "FRAME", "OBJECT", "EMBED"].includes(node.tagName)
          )
            found.push(`${selector} → ${node.tagName.toLowerCase()}`);
    return found;
  }, include);
  if (hidden.length > 0)
    throw new Error(
      `axe clásico no ve dentro de iframes ni sombras: ${hidden.join(", ")}`,
    );
  const builder = new AxeBuilder({ page }).setLegacyMode(true);
  for (const selector of include) builder.include(selector);
  for (const selector of exclude) builder.exclude(selector);
  return builder.analyze();
}
