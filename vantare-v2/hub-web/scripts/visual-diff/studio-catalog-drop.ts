import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { studioText } from "../../src/renderer/i18n/studio.ts";
import { studioDropText } from "../../src/renderer/i18n/studio-drop.ts";
import type { VisualScene } from "./scenes";
import { studioCanvasScenes } from "./studio-canvas.ts";

export const studioCatalogDropScenes: Record<string, VisualScene> =
  Object.fromEntries(
    ["panel", "drag", "outside", "added", "qa-host-rejected"].map((state) => [
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
          const coverage = await page.evaluate(() => {
            const plane = document
              .querySelector(".v-studio-canvas-plane")
              ?.getBoundingClientRect();
            const panel = document
              .querySelector(".v-canvas-catalog")
              ?.getBoundingClientRect();
            if (!plane || !panel) throw Error("Canvas and catalogue required");
            const overlap =
              Math.max(
                0,
                Math.min(plane.right, panel.right) -
                  Math.max(plane.left, panel.left),
              ) *
              Math.max(
                0,
                Math.min(plane.bottom, panel.bottom) -
                  Math.max(plane.top, panel.top),
              );
            return {
              plane: plane.toJSON(),
              panel: panel.toJSON(),
              coveredPercent: (overlap / (plane.width * plane.height)) * 100,
            };
          });
          const width = Number(
            await page
              .locator(".v-studio-canvas-plane")
              .getAttribute("data-canvas-width"),
          );
          try {
            await page.evaluate(
              ({ inject, width }) => {
                const send = MessagePort.prototype.postMessage;
                const evidence = {
                  addCount: 0,
                  injected: false,
                  x: null as number | null,
                  restore: () => {
                    MessagePort.prototype.postMessage = send;
                  },
                };
                Reflect.set(window, "catalogCaptureQA", evidence);
                MessagePort.prototype.postMessage = function (
                  message,
                  options,
                ) {
                  if (
                    message?.kind === "request" &&
                    message.request?.method === "studio.add"
                  ) {
                    evidence.addCount++;
                    if (inject && message.request.at && !evidence.injected) {
                      evidence.injected = true;
                      evidence.x = width;
                      message = {
                        ...message,
                        request: {
                          ...message.request,
                          at: { ...message.request.at, x: width },
                        },
                      };
                    }
                  }
                  send.call(
                    this,
                    message,
                    Array.isArray(options) ? { transfer: options } : options,
                  );
                };
              },
              { inject: state === "qa-host-rejected", width },
            );
            let statusBefore = "";
            const status = page.locator(
              '.v-canvas-accessible-help[role="status"]',
            );
            if (state !== "panel") {
              const handle = page
                .getByRole("button", { name: "Añadir Delta", exact: true })
                .locator("..")
                .locator(".v-canvas-catalog-grip");
              await handle.scrollIntoViewIfNeeded();
              const source = await handle.boundingBox(),
                plane = await page
                  .locator(".v-studio-canvas-plane")
                  .boundingBox();
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
                statusBefore = (await status.textContent()) ?? "";
                await page.mouse.up();
                await status
                  .filter({ hasText: studioDropText.cancel })
                  .waitFor({ state: "attached" });
                assert.deepEqual(
                  (await page.getByRole("alert").allTextContents())
                    .map((text) => text.trim())
                    .filter(Boolean),
                  [],
                );
              }
              if (state === "added") {
                await page.mouse.up();
                await page
                  .getByRole("button", { name: "Delta 2", exact: true })
                  .waitFor();
              }
              if (state === "qa-host-rejected") {
                statusBefore = (await status.textContent()) ?? "";
                await page.mouse.up();
                await page
                  .getByText(studioText.failed, { exact: true })
                  .waitFor();
                await status
                  .filter({ hasText: /^$/ })
                  .waitFor({ state: "attached" });
              }
            }
            const statusAfter = (await status.textContent()) ?? "";
            const transport = await page.evaluate(() => {
              const value = Reflect.get(window, "catalogCaptureQA");
              return {
                addCount: value.addCount,
                injected: value.injected,
                x: value.x,
              };
            });
            assert.equal(
              transport.addCount,
              state === "added" || state === "qa-host-rejected" ? 1 : 0,
            );
            if (state === "qa-host-rejected") {
              assert.equal(transport.injected, true);
              assert.equal(transport.x, width);
              assert.equal(statusAfter, "");
            }
            const outputIndex = process.argv.indexOf("--output");
            if (outputIndex >= 0) {
              const scheme = await page.evaluate(
                () => document.documentElement.dataset.scheme,
              );
              assert.ok(scheme);
              await writeFile(
                join(
                  process.argv[outputIndex + 1],
                  scheme,
                  `studio-catalog-${state}`,
                  "catalog-qa.json",
                ),
                JSON.stringify(
                  {
                    scenario:
                      state === "qa-host-rejected"
                        ? "rechazo del host inyectado por QA"
                        : state,
                    statusBefore,
                    statusAfter,
                    ...transport,
                    ...coverage,
                  },
                  null,
                  2,
                ),
              );
            }
          } finally {
            if (!page.isClosed())
              await page.evaluate(() => {
                Reflect.get(window, "catalogCaptureQA")?.restore();
                Reflect.deleteProperty(window, "catalogCaptureQA");
              });
          }
        },
        async cleanup(page) {
          if (state === "drag") {
            await page.keyboard.press("Escape");
            await page.mouse.up();
          }
        },
      } satisfies VisualScene,
    ]),
  );
