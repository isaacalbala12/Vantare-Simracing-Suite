import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function checkAppearanceDensity(original: Page, base: string) {
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
          .getByRole("tab", { name: "Apariencia", exact: true })
          .click();
        await page
          .locator(".v-appearance-groups .v-setting-row")
          .first()
          .waitFor();
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
            const groups = page.locator(".v-appearance-groups");
            assert.equal(await groups.count(), 1);
            assert.equal(
              await groups.evaluate((node) => getComputedStyle(node).gap),
              height < 820 ? "10px" : "16px",
            );
            const descriptions = groups.locator(
              ".v-setting-row > div:first-child > .v-setting-label + p.v-muted",
            );
            assert.equal(
              await descriptions.count(),
              5,
              "Positive control: all optional descriptions remain in the DOM",
            );
            for (const description of await descriptions.all())
              assert.equal(await description.isVisible(), height >= 820);
            const rows = groups.locator(
              ".v-setting-row:not(.v-setting-row--optional)",
            );
            assert.equal(
              await rows.count(),
              4,
              "Positive control: interface and motion controls remain",
            );
            for (const row of await rows.all())
              assert.equal(
                await row.evaluate((node) => getComputedStyle(node).minHeight),
                height < 820 ? "38px" : "44px",
              );
            await page
              .getByRole("tab", { name: "Atajos", exact: true })
              .click();
            const shortcutDescriptions = page.locator(
              ".v-setting-row > div:first-child > p.v-muted",
            );
            await shortcutDescriptions.first().waitFor();
            assert.ok(
              (await shortcutDescriptions.count()) > 0,
              "Positive control: shortcut scope/status text exists",
            );
            for (const description of await shortcutDescriptions.all())
              assert.ok(
                await description.isVisible(),
                "Appearance density must never hide shortcut warnings or scope text",
              );
            await page
              .getByRole("tab", { name: "Apariencia", exact: true })
              .click();
            await groups.waitFor();
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
