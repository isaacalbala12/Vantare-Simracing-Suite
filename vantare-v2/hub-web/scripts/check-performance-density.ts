import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { performanceText as text } from "../src/renderer/i18n/performance.es";

export async function checkPerformanceDensity(original: Page, base: string) {
  const browser = original.context().browser();
  assert.ok(browser);
  const context = await browser.newContext();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      try {
        await page.setViewportSize({ width, height });
        await page.goto(`${base}?escena=visual-dark:ajustes-con-diseno`);
        await page
          .getByRole("tab", { name: "Rendimiento en pista", exact: true })
          .click();
        const summary = page.locator(".v-performance-compact-summary");
        await summary.waitFor({ state: "attached" });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        for (const scheme of ["dark", "light"]) {
          await page.evaluate((value) => {
            document.documentElement.dataset.scheme = value;
          }, scheme);
          for (const expanded of [false, true]) {
            const sidebar = page.locator(".v-sidebar");
            if (
              (await sidebar.evaluate(
                (node) => !node.classList.contains("v-sidebar--collapsed"),
              )) !== expanded
            )
              await page
                .getByRole("button", {
                  name: /^(Contraer o ampliar navegación|Contraer barra)$/,
                })
                .first()
                .click();
            assert.equal(
              await sidebar.evaluate(
                (node) => !node.classList.contains("v-sidebar--collapsed"),
              ),
              expanded,
            );
            assert.equal(
              await summary.count(),
              1,
              "Positive control: confirmed cadence exists",
            );
            assert.equal(
              await summary.isVisible(),
              height < 820,
              "Compact keeps the cadence when the table is hidden",
            );
            assert.equal(
              await page
                .getByRole("table", { name: text.table, includeHidden: true })
                .isVisible(),
              height >= 820,
            );
            assert.ok((await summary.textContent())?.includes("Hz"));
            assert.ok(
              await page
                .getByText(text.automaticHelp, { exact: true })
                .isVisible(),
              "Automatic remains honestly marked as forthcoming",
            );
          }
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
}
