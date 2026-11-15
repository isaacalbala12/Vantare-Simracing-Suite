import assert from "node:assert/strict";
import { studioFrequencyText as text } from "../../src/renderer/i18n/studio-frequency.es.ts";
import type { VisualScene } from "./scenes.ts";
import { studioScenes } from "./studio.ts";

export const studioFrequencyScenes: Record<string, VisualScene> = {
  "studio-frecuencia": {
    mock: "studio-base",
    async prepare(page) {
      await studioScenes["studio-base"].prepare(page);
      await page.getByRole("tab", { name: "En pista", exact: true }).click();
      const group = page.getByRole("group", {
        name: text.choices,
        exact: true,
      });
      await group.scrollIntoViewIfNeeded();
      assert.equal(await group.getByRole("button").count(), 9);
      assert.equal(
        await group
          .getByRole("button", { name: text.inherit, exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page
        .getByRole("region", { name: text.title, exact: true })
        .waitFor();
    },
  },
};
