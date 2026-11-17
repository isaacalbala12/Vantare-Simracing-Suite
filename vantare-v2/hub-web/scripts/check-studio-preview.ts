import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "playwright-core";
import tokens from "../design/tokens.json";
import { studioText } from "../src/renderer/i18n/studio";
import { until } from "./wait-for";

const text = studioText.preview;
const cases = [
  ["photo", text.photo],
  ["noDemo", text.drawing],
  ["captureFailed", text.failed],
  ["timeout", text.timeout],
  ["preparing", text.preparing],
  ["protected", text.drawing],
  ["studioConflict", text.drawing],
  ["generating", text.preparing],
  ["busy", text.busy],
  ["tooLarge", text.tooLarge],
  ["invalidInput", text.failed],
  ["graphicsDisabled", text.drawing],
  ["unavailable", text.drawing],
  ["gpuUnavailable", text.failed],
] as const;

/** Web-only fixture injection. No Rune, native window, production flags or host changes. */
export async function checkStudioPreview(
  parent: Page,
  base: string,
  evidence: string,
) {
  const svg = await readFile(
    new URL("../fixtures/preview-stage.svg", import.meta.url),
    "utf8",
  );
  const painter = await parent.context().newPage();
  let png: string;
  try {
    png = await painter.evaluate(async (svg) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 338;
      canvas.height = 304;
      const context = canvas.getContext("2d");
      if (!context) throw Error("QA canvas unavailable");
      context.drawImage(image, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    }, svg);
  } finally {
    await painter.close();
  }
  const results = [];
  for (const theme of ["dark", "light"] as const) {
    for (const [mode, title] of cases) {
      const page = await parent.context().newPage();
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.addInitScript(
          ({ mode, png, theme }) => {
            const send = MessagePort.prototype.postMessage;
            let view: unknown;
            let count = 0;
            Reflect.set(window, "previewQaRequests", []);
            MessagePort.prototype.postMessage = function (message, options) {
              if (message?.kind === "hello")
                message = {
                  ...message,
                  theme: { ...message.theme, scheme: theme },
                };
              if (
                message?.kind === "response" &&
                message.result?.method === "settings.get"
              )
                message = {
                  ...message,
                  result: {
                    ...message.result,
                    value: {
                      ...message.result.value,
                      appearance: {
                        ...message.result.value.appearance,
                        scheme: theme,
                      },
                    },
                  },
                };
              if (
                message?.kind === "request" &&
                message.request?.method === "preview.render"
              ) {
                (Reflect.get(window, "previewQaRequests") as unknown[]).push(
                  message.request,
                );
              }
              if (
                mode === "protected" &&
                message?.kind === "event" &&
                message.event?.topic === "studio"
              )
                message = {
                  ...message,
                  event: {
                    ...message.event,
                    value: { ...message.event.value, state: "protected" },
                  },
                };
              if (
                message?.kind === "response" &&
                message.result?.method === "studio.get"
              ) {
                if (mode === "protected")
                  message = {
                    ...message,
                    result: {
                      ...message.result,
                      value: { ...message.result.value, state: "protected" },
                    },
                  };
                view = message.result.value;
              }
              if (
                message?.kind === "response" &&
                message.result?.method === "preview.render"
              ) {
                count++;
                if (
                  mode === "preparing" ||
                  (mode === "generating" && count > 1)
                )
                  return;
                if (mode === "photo")
                  message = {
                    ...message,
                    result: {
                      method: "preview.render",
                      value: { width: 338, height: 304, pngBase64: png },
                    },
                  };
                else
                  message = {
                    kind: "failure",
                    id: message.id,
                    error:
                      mode === "studioConflict"
                        ? { kind: "studioConflict", current: view }
                        : mode === "protected"
                          ? { kind: "protected" }
                          : mode === "busy"
                            ? { kind: "busy" }
                            : {
                                kind: "previewFailed",
                                reason:
                                  mode === "generating"
                                    ? "captureFailed"
                                    : mode,
                              },
                  };
              }
              send.call(
                this,
                message,
                Array.isArray(options) ? { transfer: options } : options,
              );
            };
          },
          { mode, png, theme },
        );
        await page.goto(`${base}?escena=preview-image`);
        await page
          .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
          .click();
        if (mode === "generating")
          await page
            .getByRole("button", { name: text.retryLabel, exact: true })
            .click();
        const stage = page.locator(".v-preview-stage");
        await stage.getByText(title, { exact: true }).waitFor();
        if (mode === "noDemo")
          await until(
            () =>
              stage
                .locator(".v-widget-preview[data-stage='true']")
                .evaluate(
                  (node) =>
                    node.clientHeight ===
                    node.closest(".v-focus-drawing")?.clientHeight,
                ),
            5000,
            "illustration retains the full Stage height",
          );
        if (mode === "photo") await stage.locator(".v-preview-photo").waitFor();
        if (mode === "studioConflict")
          await page.getByText(text.conflictTitle, { exact: true }).waitFor();
        if (mode === "generating")
          assert.equal(
            await stage
              .getByRole("button", { name: text.generatingLabel })
              .getAttribute("aria-disabled"),
            "true",
          );
        const sealBackground = await stage
          .locator(".v-preview-seal")
          .evaluate((node) => getComputedStyle(node).backgroundColor);
        const expectedColor = tokens.themes.vantare[theme]["surface-panel"];
        assert.deepEqual(
          sealBackground
            .match(/[\d.]+/g)
            ?.slice(0, 3)
            .map(Number),
          [1, 3, 5].map((offset) =>
            parseInt(expectedColor.slice(offset, offset + 2), 16),
          ),
          `${theme}: effective surface-panel follows Settings, without mixed theme tokens`,
        );
        const report = await new AxeBuilder({ page }).analyze();
        results.push({ theme, mode, violations: report.violations });
        await writeFile(
          resolve(evidence, "axe-studio-preview.json"),
          JSON.stringify(results, null, 2),
        );
        assert.deepEqual(
          report.violations,
          [],
          `Studio preview ${theme}/${mode}`,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: resolve(evidence, `preview-${mode}-${theme}-1440.png`),
        });
        if (mode === "photo") {
          const label = stage.getByRole("img");
          assert.equal(await label.count(), 1);
          assert.equal(
            await label.getAttribute("aria-label"),
            text.photoLabel("Standings"),
          );
          await page.setViewportSize({ width: 1280, height: 720 });
          await until(
            () =>
              stage.locator(".v-preview-metadata").evaluate((node) => {
                const box = node.getBoundingClientRect();
                const header = node.closest("header");
                const map = document
                  .querySelector(".v-studio-minimap")
                  ?.getBoundingClientRect();
                const actions = document
                  .querySelector(".v-studio-stage-actions")
                  ?.getBoundingClientRect();
                const reason =
                  document.querySelector<HTMLElement>(".v-preview-reason");
                return (
                  !!header &&
                  !!map &&
                  !!actions &&
                  box.width > 0 &&
                  box.bottom <= map.top &&
                  box.right <= actions.left &&
                  !!reason &&
                  reason.scrollWidth <= reason.clientWidth
                );
              }),
            5000,
            "photo metadata in top row without minimap or data overlap at 1280",
          );
          await page.screenshot({
            path: resolve(evidence, `preview-photo-${theme}-1280.png`),
          });
          await stage
            .getByRole("button", { name: text.info, exact: true })
            .click();
          await stage.getByRole("note").waitFor();
          await page.keyboard.press("Escape");
          assert.equal(
            await stage
              .getByRole("button", { name: text.info })
              .evaluate((node) => node === document.activeElement),
            true,
          );
        }
        const requests = await page.evaluate(
          () => Reflect.get(window, "previewQaRequests") as unknown[],
        );
        assert.equal(
          requests.length,
          mode === "protected" ? 0 : mode === "generating" ? 2 : 1,
          `${mode}: no automatic retry`,
        );
      } catch (error) {
        await writeFile(
          resolve(evidence, `preview-${mode}-${theme}-failure.html`),
          await page.content(),
        );
        await page.screenshot({
          path: resolve(evidence, `preview-${mode}-${theme}-failure.png`),
        });
        throw error;
      } finally {
        await page.close();
      }
    }
  }
}

if (import.meta.main) {
  const { mkdir } = await import("node:fs/promises");
  const { chromium } = await import("playwright-core");
  const { webQaPreview } = await import("./web-qa");
  const evidence =
    process.env.VANTARE_HUB_EVIDENCE ?? "test-results/studio-preview";
  await mkdir(evidence, { recursive: true });
  const server = await webQaPreview();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ timeout: 15000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    await checkStudioPreview(
      page,
      server.resolvedUrls?.local[0] ?? "",
      evidence,
    );
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
