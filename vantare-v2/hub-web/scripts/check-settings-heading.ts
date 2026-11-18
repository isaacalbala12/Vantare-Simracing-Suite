import assert from "node:assert/strict";
import type { Page } from "playwright-core";

/**
 * Ajustes: el buscador no puede tapar el subtítulo de la sección (#2633).
 * Chromium mide el layout real; jsdom no evalúa estas media queries.
 */
const tabs = [
  "Cuenta",
  "General",
  "Apariencia",
  "Rendimiento en pista",
  "Atajos",
  "Actualizaciones",
  "Privacidad",
  "Diagnóstico",
] as const;

const sizes = [
  [1440, 900],
  [1280, 900],
  [1280, 820],
  [1280, 800],
  [1280, 720],
  // 1280x900 con zoom 125 %: el viewport CSS baja a 1024x720.
  [1024, 720],
] as const;

export async function checkSettingsHeading(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=ajustes-con-diseno`);
      await page.getByRole("tab", { name: "General", exact: true }).waitFor();
      const sidebar = page.locator(".v-sidebar");
      if (
        await sidebar.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        )
      )
        await page
          .getByRole("button", {
            name: /^(Contraer o ampliar navegación|Contraer barra)$/,
            exact: true,
          })
          .first()
          .click();
      for (const scheme of ["light", "dark"] as const) {
        await page.evaluate((value) => {
          document.documentElement.dataset.scheme = value;
        }, scheme);
        for (const tab of tabs) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await page.getByRole("tabpanel").waitFor();
          const geometry = await page
            .locator(".v-settings-heading")
            .evaluate((heading) => {
              const caption = heading.querySelector(".v-page-header p");
              const header = heading.querySelector(".v-page-header");
              const search = heading.querySelector(".v-settings-search input");
              if (!header || !search) return null;
              const visible = (node: Element) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              };
              const rect = (node: Element) => {
                const value = node.getBoundingClientRect();
                return {
                  left: value.left,
                  right: value.right,
                  top: value.top,
                  bottom: value.bottom,
                };
              };
              return {
                header: rect(header),
                caption: caption && visible(caption) ? rect(caption) : null,
                search: rect(search),
              };
            });
          assert.ok(geometry, `${tab}: settings heading is missing`);
          const label = `${tab} ${width}x${height} ${scheme}`;
          if (!geometry.caption) continue;
          const caption = geometry.caption;
          const search = geometry.search;
          const overlapWidth =
            Math.min(caption.right, search.right) -
            Math.max(caption.left, search.left);
          const overlapHeight =
            Math.min(caption.bottom, search.bottom) -
            Math.max(caption.top, search.top);
          assert.ok(
            overlapWidth <= 0 || overlapHeight <= 0,
            `${label}: el buscador tapa el subtítulo (${overlapWidth.toFixed(1)}x${overlapHeight.toFixed(1)} px)`,
          );
          assert.ok(
            caption.right <= geometry.header.right + 1,
            `${label}: el subtítulo se sale de su cabecera (${caption.right.toFixed(1)} > ${geometry.header.right.toFixed(1)})`,
          );
        }
      }
    }
  } finally {
    await page.setViewportSize(original ?? { width: 1440, height: 900 });
  }
}
