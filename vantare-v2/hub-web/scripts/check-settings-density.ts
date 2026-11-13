import assert from "node:assert/strict";
import type { Page } from "playwright-core";

export async function checkSettingsDensity(page: Page, base: string) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}?escena=ajustes-con-diseno`);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.locator(".v-settings-general").waitFor();
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
          const general = page.locator(".v-settings-general");
          const row = general.locator(".v-setting-row").first();
          assert.equal(
            await row.locator(".v-muted").isVisible(),
            height >= 820,
          );
          const bounds = await row.boundingBox();
          assert.ok(bounds);
          if (height < 820)
            assert.ok(
              Math.abs(bounds.height - 38) <= 1,
              "Compact setting row must be 38 px",
            );
          else
            assert.ok(
              bounds.height >= 44,
              "Normal setting row must retain its explanation",
            );
          const reasons = general.locator(".v-setting-important-help");
          assert.ok(
            (await reasons.count()) >= 2,
            "Availability reasons must be present, not an empty assertion",
          );
          for (const reason of await reasons.all())
            assert.equal(
              await reason.isVisible(),
              true,
              "Availability reasons stay visible in the compact layout",
            );
        }
      }
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
