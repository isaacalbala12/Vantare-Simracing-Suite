import { canvasText as t } from "../../src/renderer/i18n/studio-canvas.ts";
import type { VisualScene } from "./scenes";

export const studioCanvasScenes: Record<string, VisualScene> =
  Object.fromEntries(
    [
      "studio-canvas",
      "studio-canvas-outside",
      "studio-canvas-conflict",
      "studio-canvas-readonly",
      "studio-canvas-list-collapsed",
    ].map((scene) => [
      scene,
      {
        mock:
          scene === "studio-canvas-list-collapsed" ? "studio-canvas" : scene,
        async prepare(page) {
          const expanded = await page
            .locator(".v-sidebar")
            .evaluate(
              (node) => !node.classList.contains("v-sidebar--collapsed"),
            );
          await page
            .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
            .click();
          await page.getByRole("button", { name: t.open, exact: true }).click();
          const move = page.getByRole("button", {
            name: t.move("Standings"),
            exact: true,
          });
          await move.waitFor();
          // Canvas entry collapses automatically. An expanded capture is an
          // explicit manual reopening, exactly as the user may do in this view.
          if (expanded) await page.keyboard.press("Control+b");
          if (scene === "studio-canvas-list-collapsed")
            await page
              .getByRole("button", { name: t.collapseList, exact: true })
              .click();
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

studioCanvasScenes["studio-canvas-info"] = {
  mock: "studio-canvas",
  async prepare(page) {
    await studioCanvasScenes["studio-canvas"].prepare(page);
    await page.getByRole("button", { name: t.note, exact: true }).hover();
    await page.getByRole("tooltip").filter({ hasText: t.note }).waitFor();
  },
};

for (const scene of [
  "studio-canvas-monitor",
  "studio-canvas-monitor-missing",
]) {
  studioCanvasScenes[scene] = {
    mock: scene,
    async prepare(page) {
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page.getByRole("button", { name: t.open, exact: true }).click();
      if (scene.endsWith("-missing")) {
        await page
          .getByRole("heading", { name: t.noCanvasTitle, exact: true })
          .waitFor();
      } else {
        await page
          .getByRole("button", { name: t.resolution, exact: true })
          .click();
        await page.getByRole("radio", { name: /Tu monitor/ }).waitFor();
      }
    },
  };
}
