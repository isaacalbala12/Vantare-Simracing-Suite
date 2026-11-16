import assert from "node:assert/strict";
import { studioText } from "../../src/renderer/i18n/studio.ts";
import { studioDropText } from "../../src/renderer/i18n/studio-drop.ts";
import type { VisualScene } from "./scenes";
import { studioCanvasScenes } from "./studio-canvas.ts";

export const studioCatalogDropScenes: Record<string, VisualScene> =
  Object.fromEntries(
    ["panel", "drag", "outside", "added"].map((state) => [
      `studio-catalog-${state}`,
      {
        mock: "studio-canvas",
        async prepare(page) {
          await studioCanvasScenes["studio-canvas"].prepare(page);
          await page
            .getByRole("button", { name: studioText.add, exact: true })
            .click();
          await page
            .getByRole("complementary", {
              name: studioText.catalog,
              exact: true,
            })
            .waitFor();
          if (state === "panel") return;
          const handle = page.getByRole("button", {
            name: studioDropText.drag("Delta"),
            exact: true,
          });
          await handle.scrollIntoViewIfNeeded();
          const source = await handle.boundingBox(),
            plane = await page.locator(".v-studio-canvas-plane").boundingBox();
          assert.ok(source && plane);
          await page.mouse.move(
            source.x + source.width / 2,
            source.y + source.height / 2,
          );
          await page.mouse.down();
          await page.mouse.move(
            plane.x + plane.width / 2,
            plane.y + plane.height / 2,
            { steps: 8 },
          );
          await page.locator(".v-canvas-drop-ghost").waitFor();
          if (state === "outside") {
            await page.mouse.move(100, 100, { steps: 4 });
            await page
              .locator('.v-canvas-drop-follower[data-valid="false"]')
              .waitFor();
          }
          if (state === "added") {
            await page.mouse.up();
            await page
              .getByRole("button", { name: "Delta 2", exact: true })
              .waitFor();
          }
        },
      } satisfies VisualScene,
    ]),
  );
