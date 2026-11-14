import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { t } from "../src/renderer/i18n/es.ts";

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
            (await reasons.count()) === 2,
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
      await page.getByRole("tab", { name: "Atajos", exact: true }).click();
      const descriptions = page.locator(".v-setting-row .v-muted");
      await descriptions.first().waitFor();
      assert.ok(
        (await descriptions.count()) > 0,
        "Shortcuts must contain status/help text",
      );
      for (const description of await descriptions.all())
        assert.equal(
          await description.isVisible(),
          true,
          "Compact General rules must not hide shortcut statuses or empty-state explanations",
        );
      for (const state of ["registered", "unconfirmed"] as const)
        assert.ok(
          await page
            .getByText(t(`shortcuts.${state}`), { exact: true })
            .isVisible(),
          `Shortcut ${state} must remain readable`,
        );
      for (const name of ["Privacidad", "Diagnóstico"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        const help = page.locator(".v-setting-row .v-muted");
        await help.first().waitFor();
        assert.ok(
          (await help.count()) > 0,
          `${name} must exercise real help text`,
        );
        for (const description of await help.all())
          assert.equal(
            await description.isVisible(),
            true,
            `${name} help must remain visible`,
          );
      }
      await page.goto(`${base}?escena=visual-dark:ajustes-con-diseno`);
      await page.getByRole("tab", { name: "Atajos", exact: true }).click();
      await page.getByText(t("shortcuts.empty"), { exact: true }).waitFor();
      assert.ok(
        await page.getByText(t("shortcuts.empty"), { exact: true }).isVisible(),
        "Empty shortcut explanation must remain readable",
      );
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
