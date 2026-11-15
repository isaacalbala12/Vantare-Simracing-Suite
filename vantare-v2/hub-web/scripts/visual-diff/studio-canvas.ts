import { canvasText as t } from "../../src/renderer/i18n/studio-canvas.ts";
import type { VisualScene } from "./scenes";

export const studioCanvasScenes: Record<string, VisualScene> =
  Object.fromEntries(
    [
      "studio-canvas",
      "studio-canvas-outside",
      "studio-canvas-conflict",
      "studio-canvas-readonly",
    ].map((scene) => [
      scene,
      {
        mock: scene,
        async prepare(page) {
          await page
            .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
            .click();
          await page.getByRole("button", { name: t.open, exact: true }).click();
          const move = page.getByRole("button", {
            name: t.move("Standings"),
            exact: true,
          });
          await move.waitFor();
          if (scene === "studio-canvas-conflict") {
            await move.focus();
            await page.keyboard.press("ArrowRight");
            await page
              .getByRole("alert")
              .filter({ hasText: t.changed })
              .waitFor();
          }
        },
      },
    ]),
  );
