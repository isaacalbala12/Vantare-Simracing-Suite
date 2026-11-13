import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function checkRoadmapDensity(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=roadmap-base`);
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.locator(".v-roadmap").waitFor();
      for (const scheme of ["dark", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.scheme = value;
        }, scheme);
        for (const expanded of [false, true]) {
          const nav = page.locator(".v-sidebar");
          if (
            (await nav.evaluate(
              (node) => !node.classList.contains("v-sidebar--collapsed"),
            )) !== expanded
          )
            await page
              .getByRole("button", {
                name: /^(Contraer o ampliar navegación|Contraer barra)$/,
              })
              .first()
              .click();
          for (const tab of ["Circuito", "Tablero", "Temporada"]) {
            await page.getByRole("tab", { name: tab, exact: true }).click();
            const title = page.locator(".v-roadmap-header h1");
            assert.equal(
              await title.evaluate((node) => getComputedStyle(node).fontSize),
              height < 820 ? "24px" : "28px",
            );
            assert.equal(
              await page.locator(".v-roadmap-header p").isVisible(),
              height >= 820,
            );
            assert.equal(
              await page
                .locator(".v-roadmap")
                .evaluate((node) => getComputedStyle(node).gap),
              height < 820 ? "10px" : "12px",
            );
            const columns = page.locator(
              tab === "Temporada"
                ? ".v-roadmap-season"
                : ".v-roadmap-lanes > section",
            );
            assert.equal(
              await columns.count(),
              tab === "Temporada" ? 1 : 3,
              "Positive control: real roadmap columns",
            );
            for (const column of await columns.all())
              assert.ok(
                await column.evaluate((node) => {
                  const main = node.closest(".v-shell-main");
                  if (!main) return false;
                  const footer =
                    main.getBoundingClientRect().bottom -
                    parseFloat(getComputedStyle(main).paddingBottom);
                  const bounds = node.getBoundingClientRect();
                  return (
                    bounds.height > 100 && Math.abs(bounds.bottom - footer) <= 2
                  );
                }),
                "Roadmap columns must retain their free height down to the footer",
              );
          }
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
