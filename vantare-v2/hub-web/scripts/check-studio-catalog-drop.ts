import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { studioText } from "../src/renderer/i18n/studio.ts";
import { canvasText } from "../src/renderer/i18n/studio-canvas.ts";
import { studioDropText } from "../src/renderer/i18n/studio-drop.ts";
import { until } from "./wait-for";

/** Actual pointer capture, clipping/hit testing and focus; jsdom cannot prove these. */
export async function checkStudioCatalogDrop(
  parent: Page,
  base: string,
  evidence: string,
) {
  const page = await parent.context().newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      Reflect.set(window, "catalogAdds", []);
      const send = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (message, options) {
        if (
          message?.kind === "request" &&
          message.request?.method === "studio.add"
        )
          (Reflect.get(window, "catalogAdds") as unknown[]).push(
            message.request,
          );
        send.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    const adds = () =>
      page.evaluate(
        () =>
          Reflect.get(window, "catalogAdds") as {
            at?: { x: number; y: number };
          }[],
      );
    const setup = async (scene = "studio-canvas") => {
      await page.goto(`${base}?escena=${scene}`);
      await page
        .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
        .click();
      await page
        .getByRole("button", { name: canvasText.open, exact: true })
        .click();
      await page
        .getByRole("button", { name: studioText.add, exact: true })
        .first()
        .click();
      await page
        .getByRole("complementary", { name: studioText.catalog, exact: true })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
    };
    const start = async () => {
      const handle = page.getByRole("button", {
        name: studioDropText.drag("Delta"),
        exact: true,
      });
      await handle.scrollIntoViewIfNeeded();
      const source = await handle.boundingBox();
      const plane = await page.locator(".v-studio-canvas-plane").boundingBox();
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
      return plane;
    };
    await setup();
    await start();
    assert.equal(await page.locator(".v-canvas-drop-ghost").isVisible(), true);
    assert.equal(await page.locator(".v-studio-canvas-guide").count(), 2);
    assert.equal((await adds()).length, 0);
    await page.mouse.up();
    await until(
      async () => (await adds()).length === 1,
      10000,
      "catalogue add after release",
    );
    assert.deepEqual((await adds())[0].at, { x: 885, y: 522 });
    await page.getByRole("button", { name: /^Delta 2, / }).waitFor();
    assert.equal(
      await page
        .getByRole("complementary", { name: studioText.catalog, exact: true })
        .count(),
      0,
    );

    for (const mode of ["outside", "covered", "escape"] as const) {
      await setup();
      await start();
      if (mode === "outside") await page.mouse.move(10, 100, { steps: 4 });
      if (mode === "covered") {
        const panel = await page.locator(".v-canvas-catalog").boundingBox();
        assert.ok(panel);
        await page.mouse.move(panel.x + 20, panel.y + 20, { steps: 4 });
      }
      if (mode === "escape") await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.equal((await adds()).length, 0, `${mode} must not add`);
      assert.equal(await page.locator(".v-canvas-drop-ghost").count(), 0);
      assert.equal(
        await page
          .getByRole("button", { name: canvasText.close, exact: true })
          .isVisible(),
        true,
      );
      if (mode === "escape") {
        assert.equal(await page.locator(".v-canvas-catalog").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".v-canvas-catalog").count(), 0);
      }
    }
    await setup("studio-vacio");
    await start();
    await page.mouse.up();
    await until(
      async () => (await adds()).length === 1,
      10000,
      "first catalogue widget",
    );
    assert.ok((await adds())[0].at);
    await page.getByRole("button", { name: /^Delta, / }).waitFor();

    await setup();
    const handle = page.getByRole("button", {
      name: studioDropText.drag("Delta"),
      exact: true,
    });
    await handle.focus();
    await page.keyboard.press("Enter");
    await until(
      async () => (await adds()).length === 1,
      10000,
      "keyboard catalogue add",
    );
    assert.equal((await adds())[0].at, undefined);
    await writeFile(
      resolve(evidence, "studio-catalog-drop.json"),
      JSON.stringify(
        {
          pointerCapture: true,
          localSilhouette: true,
          snapGuides: true,
          oneAddAt: true,
          outsideDoesNotAdd: true,
          coveredDoesNotAdd: true,
          escapeCancels: true,
          emptyCanvas: true,
          keyboardAlternative: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await page.close();
  }
}
