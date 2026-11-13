import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function checkTestingDensity(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=testing-tester-reference`);
      await page
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.locator(".v-testing-summary").waitFor();
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
                exact: true,
              })
              .first()
              .click();
          const header = page.locator(".v-testing-heading");
          assert.equal(
            await header
              .locator("h1")
              .evaluate((node) => getComputedStyle(node).fontSize),
            height < 820 ? "24px" : "28px",
          );
          assert.equal(await header.locator("p").isVisible(), height >= 820);
          const diagnostic = header.getByRole("button", {
            name: "Diagnóstico local",
            exact: true,
          });
          assert.equal(
            await diagnostic.count(),
            1,
            "Positive control: diagnostic action must remain present",
          );
          const label = await diagnostic
            .locator(".v-button-label")
            .boundingBox();
          assert.ok(
            label && label.height <= 22,
            "Diagnostic label must stay on one line",
          );
          const hero = await page
            .locator(".v-testing-summary-hero")
            .boundingBox();
          const heading = await header.boundingBox();
          assert.ok(
            hero && heading && hero.y >= heading.y + heading.height,
            "Hero must not overlap its header",
          );
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
