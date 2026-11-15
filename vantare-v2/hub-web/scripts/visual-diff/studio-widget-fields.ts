import assert from "node:assert/strict";
import { studioAdditionalCases } from "../../src/contract/generated/studio.ts";
import { studioWidgetFieldsText as text } from "../../src/renderer/i18n/studio-widget-fields.es.ts";
import type { VisualScene } from "./scenes.ts";

export const studioWidgetFieldScenes: Record<string, VisualScene> = {};
const kinds = new Set(studioAdditionalCases.map((value) => value.before.kind));
for (const kind of kinds) {
  if (kind === "session-alerts") continue;
  const id = `studio-fields-${kind}`;
  studioWidgetFieldScenes[id] = {
    mock: id,
    async prepare(page) {
      await page
        .getByRole("button", {
          name: /^(Studio|Overlays Studio)$/,
          exact: true,
        })
        .click();
      const content = page.getByRole("tab", { name: "Contenido", exact: true });
      await content.click();
      const group = page.getByRole("region", {
        name: text.content,
        exact: true,
      });
      await group.waitFor();
      await group.scrollIntoViewIfNeeded();
      assert.ok(
        await group
          .locator('input,button[role="switch"],button[role="combobox"]')
          .count(),
      );
    },
  };
}
for (const kind of ["broadcast-tower", "car-damage-visual", "racing-flags"]) {
  const id = `studio-fields-${kind}-track`;
  studioWidgetFieldScenes[id] = {
    mock: `studio-fields-${kind}`,
    async prepare(page) {
      await studioWidgetFieldScenes[`studio-fields-${kind}`].prepare(page);
      await page.getByRole("tab", { name: "En pista", exact: true }).click();
      const group = page.getByRole("region", {
        name: text.behavior,
        exact: true,
      });
      await group.scrollIntoViewIfNeeded();
      await group.waitFor();
    },
  };
}
