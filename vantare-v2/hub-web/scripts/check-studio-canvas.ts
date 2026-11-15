import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { canvasText as t } from "../src/renderer/i18n/studio-canvas.ts";
import { studioCanvasScenes } from "./visual-diff/studio-canvas.ts";
import { until } from "./wait-for";

/** Native pointer capture and focus, not jsdom's synthetic layout. */
export async function checkStudioCanvas(
  parent: Page,
  base: string,
  evidence: string,
) {
  const page = await parent.context().newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const scene of [
      "studio-canvas",
      "studio-canvas-conflict",
      "studio-canvas-readonly",
    ]) {
      await page.goto(`${base}?escena=${scene}`);

      await page.evaluate(() => {
        Reflect.set(window, "canvasRequests", []);
        const send = MessagePort.prototype.postMessage;
        MessagePort.prototype.postMessage = function (message, options) {
          if (
            message?.kind === "request" &&
            message.request?.method === "studio.geometry"
          )
            (Reflect.get(window, "canvasRequests") as unknown[]).push(
              message.request,
            );
          send.call(
            this,
            message,
            Array.isArray(options) ? { transfer: options } : options,
          );
        };
      });
      await studioCanvasScenes[scene].prepare(page);
      const count = () =>
        page.evaluate(
          () => (Reflect.get(window, "canvasRequests") as unknown[]).length,
        );
      const move = page.getByRole("button", {
        name: t.move("Standings"),
        exact: true,
      });
      await move.focus();
      if (scene.endsWith("readonly")) {
        await page.keyboard.press("ArrowRight");
        assert.equal(await count(), 0);
        assert.equal(await move.getAttribute("aria-disabled"), "true");
        continue;
      }
      if (scene.endsWith("conflict")) {
        // prepare already provoked the only conflicting request; subsequent read
        // and settling cannot replay it. The response is visible and authoritative.
        await page.getByRole("alert").filter({ hasText: t.changed }).waitFor();
        assert.equal(await count(), 1);
        continue;
      }
      const box = await move.boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 55, y + 30, { steps: 8 });
      assert.equal(await count(), 0, "preview cannot write");
      await page.mouse.up();
      await until(
        async () => (await count()) === 1,
        5000,
        "one pointer gesture",
      );
      await page.getByRole("status").filter({ hasText: t.saved }).waitFor();
      await move.focus();
      await page.keyboard.down("ArrowLeft");
      await page.keyboard.press("Escape");

      await page.keyboard.up("ArrowLeft");
      assert.equal(await count(), 1, "Escape cancels");
      await page.keyboard.down("ArrowRight");
      assert.equal(await count(), 1, "held key stays local");
      await page.keyboard.up("ArrowRight");
      await until(
        async () => (await count()) === 2,
        5000,
        "one keyboard gesture",
      );
      await page.getByRole("status").filter({ hasText: t.saved }).waitFor();
      const handle = page.locator('[data-canvas-handle="4"]');
      await handle.focus();
      await page.keyboard.press("ArrowRight");
      await until(
        async () => (await count()) === 3,
        5000,
        "resize handle is keyboard operable",
      );
      await page.getByRole("status").filter({ hasText: t.saved }).waitFor();
      await page.getByRole("button", { name: t.zoomMore, exact: true }).click();
      await page.getByRole("button", { name: t.fit, exact: true }).click();
      assert.equal(await count(), 3, "zoom and fit never persist");
      await page.getByRole("button", { name: t.anchors, exact: true }).click();
      await page
        .getByRole("button", {
          name: t.anchor(t.rows[2], t.columns[2]),
          exact: true,
        })
        .click();
      await until(
        async () => (await count()) === 4,
        5000,
        "anchor writes once",
      );
      await page.keyboard.press("Escape");
      const layout = [];
      for (const width of [1440, 1280]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 800,
        });
        for (const sidebar of ["closed", "open"]) {
          const nav = page.locator(".v-sidebar");
          if (
            (await nav.evaluate((node) =>
              node.classList.contains("v-sidebar--collapsed"),
            )) !==
            (sidebar === "closed")
          )
            await page.keyboard.press("Control+b");
          for (const scheme of ["dark", "light"]) {
            await page.evaluate((value) => {
              document.documentElement.dataset.scheme = value;
            }, scheme);
            const stage = page.locator(".v-studio-canvas-stage");
            const header = await stage.locator(":scope > header").boundingBox();
            const viewport = await stage
              .locator(".v-studio-canvas-viewport")
              .boundingBox();
            const footer = await stage.locator(":scope > footer").boundingBox();
            const help = await stage
              .locator(".v-studio-canvas-help")
              .boundingBox();
            const stageBox = await stage.boundingBox();
            const feedback = await stage
              .locator(".v-studio-canvas-feedback")
              .boundingBox();
            assert.ok(header && viewport && footer && help);
            assert.ok(stageBox && feedback);
            assert.ok(
              stageBox.y + stageBox.height >= feedback.y + feedback.height,
              "feedback stays inside the stage",
            );
            assert.ok(
              header.y + header.height <= viewport.y,
              "header cannot overlap canvas",
            );
            assert.ok(
              viewport.y + viewport.height <= footer.y,
              "footer cannot overlap canvas",
            );
            assert.ok(
              footer.y + footer.height <= help.y,
              "help cannot overlap footer",
            );
            assert.ok(viewport.height >= 200, "canvas remains usable");
            layout.push({ width, sidebar, scheme });
          }
        }
      }
      assert.equal(layout.length, 8);
    }
    await writeFile(
      resolve(evidence, "studio-canvas.json"),
      JSON.stringify(
        {
          pointerCapture: true,
          oneWriteOnRelease: true,
          escapeCancels: true,
          keyboardResize: true,
          zoomDoesNotWrite: true,
          anchor: true,
          readonly: true,
          conflictNotRetried: true,
          responsiveLayout: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await page.close();
  }
}
