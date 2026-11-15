import assert from "node:assert/strict";
import { canvasText as t } from "../../src/renderer/i18n/studio-canvas.es.ts";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";
import { studioScenes } from "./studio.ts";
export const studioCanvasScenes: Record<string, VisualScene> = {
  "studio-lienzo": {
    mock: "studio-base",
    async prepare(page) {
      await studioScenes["studio-base"].prepare(page);
      await page.getByRole("button", { name: t.open, exact: true }).click();
      const viewport = page.getByRole("application", {
        name: t.title,
        exact: true,
      });
      await viewport.waitFor();
      await until(
        () => viewport.evaluate((node) => node === document.activeElement),
        5000,
        "canvas focus",
      );
      const x = page.getByRole("textbox", { name: t.x, exact: true });
      assert.equal(await x.inputValue(), "48");
      await page.keyboard.down("Shift");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Shift");
      await until(
        async () =>
          (await x.inputValue()) === "56" &&
          (await page.locator(".v-canvas-status").textContent()) === t.saved,
        5000,
        "confirmed keyboard geometry write",
      );
      // Return to the reference geometry using a non-drag pointer alternative.
      await x.fill("48");
      await x.press("Enter");
      await until(
        async () =>
          (await x.inputValue()) === "48" &&
          (await page.locator(".v-canvas-status").textContent()) === t.saved,
        5000,
        "confirmed explicit geometry write",
      );
      await viewport.focus();
    },
  },
};
