import assert from "node:assert/strict";
import { studioText } from "../../src/renderer/i18n/studio.ts";
import { studioAlertFieldsText as text } from "../../src/renderer/i18n/studio-alert-fields.es.ts";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";

export const studioAlertFieldScenes: Record<string, VisualScene> = {};
for (const [id, tab, region] of [
  ["studio-avisos-contenido", "Contenido", text.content],
  ["studio-avisos-umbrales", "Contenido", text.thresholds],
  ["studio-avisos-pista", "En pista", text.behavior],
] as const) {
  studioAlertFieldScenes[id] = {
    mock: "studio-fields-session-alerts",
    async prepare(page) {
      await page
        .getByRole("button", {
          name: /^(Studio|Overlays Studio)$/,
          exact: true,
        })
        .click();
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const group = page.getByRole("region", { name: region, exact: true });
      await group.waitFor();
      if (id === "studio-avisos-contenido")
        await group
          .getByRole("heading", { name: text.content, exact: true })
          .scrollIntoViewIfNeeded();
      else await group.scrollIntoViewIfNeeded();
    },
  };
}
studioAlertFieldScenes["studio-avisos-normalizados"] = {
  mock: "studio-fields-session-alerts",
  async prepare(page) {
    await studioAlertFieldScenes["studio-avisos-umbrales"].prepare(page);
    const second = page.getByRole("textbox", {
      name: text.threshold(1),
      exact: true,
    });
    await second.fill("30");
    await second.press("Enter");
    await until(
      async () =>
        (await page
          .getByRole("textbox", { name: text.threshold(0), exact: true })
          .inputValue()) === "30" &&
        (await second.inputValue()) === "5" &&
        (await page.locator(".v-step-save").textContent()) ===
          studioText.autoSaved,
      10000,
      "Native sorted thresholds are confirmed",
    );
    assert.equal(
      await second.evaluate((node) => node === document.activeElement),
      true,
    );
    await page
      .getByRole("heading", { name: text.thresholds, exact: true })
      .click();
    assert.equal(
      await second.evaluate((node) => node === document.activeElement),
      false,
    );
  },
};
