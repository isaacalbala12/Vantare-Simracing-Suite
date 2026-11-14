import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function checkAccountDensity(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=cuenta-base`);
      await page.locator(".v-account-link").click();
      await page.locator(".v-account-overview").waitFor();
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
          const heading = page.locator(".v-account-identity h1");
          assert.equal(
            await heading.evaluate((node) => getComputedStyle(node).fontSize),
            height < 820 ? "26px" : "32px",
          );
          assert.equal(
            await page.locator(".v-account-contribution").isVisible(),
            height >= 820,
          );
          const modules = page.locator(".v-account-module");
          assert.ok(
            (await modules.count()) >= 5,
            "Positive control: account modules must be present",
          );
          if (height < 820) {
            const overview = await page
              .locator(".v-account-overview")
              .boundingBox();
            const access = await page
              .locator(".v-account-overview > .v-account-card")
              .first()
              .boundingBox();
            assert.ok(
              overview &&
                access &&
                Math.abs(overview.width - access.width) <= 1,
              "Access card must use the full compact column",
            );
            assert.equal(await modules.first().locator("p").isVisible(), false);
            assert.equal(
              await modules
                .first()
                .locator(".v-account-module-icon")
                .isVisible(),
              true,
            );
            const row = await modules.first().boundingBox();
            assert.ok(
              row && row.height <= 33,
              "Compact module row must be 32 px",
            );
          }
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
