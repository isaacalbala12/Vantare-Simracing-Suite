import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { studioText } from "../src/renderer/i18n/studio.ts";
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
  const measuredLayout: unknown[] = [];
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}?escena=studio-canvas`);
    await page
      .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
      .click();
    await page.keyboard.press("Control+b");
    assert.equal(await page.locator(".v-sidebar--collapsed").count(), 0);
    await page.getByRole("button", { name: t.open, exact: true }).click();
    await until(
      async () => (await page.locator(".v-sidebar--collapsed").count()) === 1,
      5000,
      "canvas collapses main navigation",
    );
    await page.keyboard.press("Control+b");
    assert.equal(await page.locator(".v-sidebar--collapsed").count(), 0);
    await page.getByRole("button", { name: t.done, exact: true }).click();
    assert.equal(
      await page.locator(".v-sidebar--collapsed").count(),
      0,
      "Widget restores the previous main navigation",
    );
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
            message.request?.method?.startsWith("studio.") &&
            message.request.method !== "studio.get"
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
      assert.equal(
        await page.locator(".v-canvas-illustration-note").count(),
        0,
      );
      if (scene === "studio-canvas") {
        await page.getByRole("button", { name: t.note, exact: true }).hover();
        const tooltip = page.getByRole("tooltip").filter({ hasText: t.note });
        await tooltip.waitFor({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await tooltip.waitFor({ state: "hidden", timeout: 5000 });
      }
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
        assert.equal(
          await page
            .getByRole("button", { name: studioText.add, exact: true })
            .isDisabled(),
          true,
        );
        const anchors = page.getByRole("button", {
          name: t.anchors,
          exact: true,
        });
        assert.equal(await anchors.getAttribute("aria-disabled"), "true");
        // aria-disabled preserves focusability; exercise the actual event guard
        // instead of Playwright's enabled-state refusal before sending a click.
        await anchors.click({ force: true });
        assert.equal(
          await page
            .getByRole("toolbar", { name: t.anchors, exact: true })
            .count(),
          0,
        );
        await move.focus();
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
            await page.waitForFunction(
              () => {
                const plane = document.querySelector<HTMLElement>(
                  ".v-studio-canvas-plane",
                );
                const viewport = document.querySelector<HTMLElement>(
                  ".v-studio-canvas-viewport",
                );
                if (!plane || !viewport) return false;
                const width = Number(plane.dataset.canvasWidth),
                  height = Number(plane.dataset.canvasHeight);
                return (
                  Math.abs(
                    plane.getBoundingClientRect().width / width -
                      Math.min(
                        viewport.clientWidth / width,
                        viewport.clientHeight / height,
                      ),
                  ) < 0.001
                );
              },
              null,
              { timeout: 5000 },
            );
            const viewport = await stage
              .locator(".v-studio-canvas-viewport")
              .boundingBox();
            const footer = await stage.locator(":scope > footer").boundingBox();
            const header = await page.locator(".v-focus-header").boundingBox();
            const plane = await stage
              .locator(".v-studio-canvas-plane")
              .boundingBox();
            assert.ok(viewport && footer && header && plane);
            assert.ok(
              header.y + header.height <= viewport.y,
              "header precedes full-height canvas",
            );
            assert.ok(
              viewport.y + viewport.height <= footer.y + 1,
              "toolbar does not cover canvas",
            );
            assert.ok(
              viewport.height >= (width === 1440 ? 500 : 400),
              "canvas uses column height",
            );
            assert.ok(
              plane.width / 1920 >=
                (sidebar === "closed" ? (width === 1440 ? 0.6 : 0.52) : 0.4),
              "fit stays legible",
            );
            assert.ok(
              Math.abs(
                plane.width / 1920 -
                  Math.min(viewport.width / 1920, viewport.height / 1080),
              ) < 0.001,
              "fit uses the real viewport without lost margins",
            );
            assert.equal(
              await stage
                .locator(".v-studio-canvas-viewport")
                .evaluate((node) => getComputedStyle(node).backgroundImage),
              "none",
            );
            assert.equal(
              await page.locator(".v-studio-temporary[hidden][inert]").count(),
              1,
            );
            assert.equal(
              await page.locator(".v-studio-temporary").isVisible(),
              false,
            );
            assert.equal(
              await stage
                .locator('.v-studio-canvas-viewport button[tabindex="0"]')
                .count(),
              1,
            );
            const measurement = {
              width,
              sidebar,
              scheme,
              viewport,
              plane,
              fitPercent: (plane.width / 1920) * 100,
            };
            layout.push(measurement);
            measuredLayout.push(measurement);
          }
        }
      }
      assert.equal(layout.length, 8);
      const beforeCollapse = await page
        .locator(".v-studio-canvas-plane")
        .boundingBox();
      assert.ok(beforeCollapse);
      await page
        .getByRole("button", { name: t.collapseList, exact: true })
        .click();
      await until(
        async () =>
          ((await page.locator(".v-studio-canvas-plane").boundingBox())
            ?.width ?? 0) > beforeCollapse.width,
        5000,
        "collapsed widget list increases canvas fit",
      );
      await page
        .getByRole("button", { name: t.expandList, exact: true })
        .click();
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
          layout: measuredLayout,
        },
        null,
        2,
      ),
    );
  } finally {
    await page.close();
  }
}
