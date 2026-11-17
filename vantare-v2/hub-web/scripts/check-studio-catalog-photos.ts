import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "playwright-core";
import { studioText } from "../src/renderer/i18n/studio";
import { until } from "./wait-for";

/** Browser-only photos from the approved drawing, never a Rune capture. */
export async function checkStudioCatalogPhotos(
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
    for (const mode of ["photos", "noDemo", "scrolled", "reduced"] as const) {
      const page = await parent.context().newPage();
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        if (mode === "reduced")
          await page.emulateMedia({ reducedMotion: "reduce" });
        await page.addInitScript(
          ({ png, theme, mode }) => {
            const send = MessagePort.prototype.postMessage;
            const catalogIds = new Set<number>();
            let released = false;
            const requests: unknown[] = [];
            Reflect.set(window, "catalogPhotoRequests", requests);
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
                message.request?.method === "preview.render" &&
                message.request.target.kind === "catalog"
              ) {
                catalogIds.add(message.id);
                requests.push(message.request);
              }
              if (
                (message?.kind === "response" || message?.kind === "failure") &&
                catalogIds.has(message.id)
              ) {
                catalogIds.delete(message.id);
                const response = {
                  kind: "response",
                  id: message.id,
                  result: {
                    method: "preview.render",
                    value: { width: 338, height: 304, pngBase64: png },
                  },
                };
                const failure = {
                  kind: "failure",
                  id: message.id,
                  error: { kind: "previewFailed", reason: "noDemo" },
                };
                if (mode === "noDemo") message = failure;
                else message = response;
                if (!released) {
                  const first = message;
                  Reflect.set(window, "releaseCatalogFirst", () => {
                    released = true;
                    send.call(
                      this,
                      first,
                      options as StructuredSerializeOptions,
                    );
                  });
                  return;
                }
              }
              return send.call(
                this,
                message,
                options as StructuredSerializeOptions,
              );
            };
          },
          { png, theme, mode },
        );
        await page.goto(`${base}?escena=preview-image`);
        await page
          .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
          .click();
        await page
          .getByRole("button", { name: studioText.add, exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: studioText.catalog,
          exact: true,
        });
        await dialog.waitFor();
        const body = dialog.locator(".v-studio-catalog-body");
        const search = dialog.getByRole("searchbox", {
          name: studioText.search,
        });
        await search.focus();
        const heights = await dialog
          .locator(".v-studio-catalog-preview")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().height),
          );
        assert(heights.length > 0);
        assert(heights.every((height) => height === 92));
        await until(
          () =>
            page.evaluate(
              () =>
                typeof Reflect.get(window, "releaseCatalogFirst") ===
                "function",
            ),
          10000,
          "catalog observer sends first visible photo",
        );
        assert.equal(
          await dialog.locator(".v-studio-catalog-photo").count(),
          0,
          "drawings before the held photo",
        );
        assert.equal(
          await dialog.locator(".v-studio-catalog-photo-wait").count(),
          1,
          "one decorative pending dot",
        );
        await page.evaluate(() => Reflect.get(window, "releaseCatalogFirst")());
        await until(
          () =>
            dialog
              .locator(".v-studio-catalog-photo-wait")
              .count()
              .then((count) => count === 0),
          10000,
          "sequential catalogue photos settled",
        );
        if (mode === "noDemo")
          assert.equal(
            await dialog.locator(".v-studio-catalog-photo").count(),
            0,
          );
        else {
          assert((await dialog.locator(".v-studio-catalog-photo").count()) > 0);
          assert.deepEqual(
            await dialog
              .locator(".v-studio-catalog-preview")
              .evaluateAll((nodes) =>
                nodes.map((node) => node.getBoundingClientRect().height),
              ),
            heights,
            "no height shift after decoding",
          );
        }
        assert.equal(
          await search.evaluate((node) => node === document.activeElement),
          true,
          "photos never move focus",
        );
        assert.equal(
          await dialog.getByRole("status").count(),
          0,
          "no announcements per photo",
        );
        const labels = await dialog
          .locator("[data-kind]")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              kind: (node as HTMLElement).dataset.kind,
              label: node.getAttribute("aria-label"),
              name: node
                .querySelector("strong")
                ?.firstChild?.textContent?.trim(),
            })),
          );
        for (const card of labels)
          assert.equal(card.label, `Añadir ${card.name}`);
        assert(
          await dialog.locator(".v-studio-catalog-photo-legend").isVisible(),
        );
        if (mode === "scrolled") {
          await body.evaluate((node) => (node.scrollTop = node.scrollHeight));
          await until(
            () =>
              body.evaluate(
                (node) =>
                  Math.abs(
                    node.scrollHeight - node.clientHeight - node.scrollTop,
                  ) < 1,
              ),
            5000,
            "catalog scrolled to end",
          );
          await until(
            () =>
              dialog
                .locator(".v-studio-catalog-photo-wait")
                .count()
                .then((count) => count === 0),
            10000,
            "scrolled catalogue photos settled",
          );
        }
        const report = await new AxeBuilder({ page }).analyze();
        results.push({
          theme,
          mode,
          violations: report.violations,
          requests: await page.evaluate(() =>
            Reflect.get(window, "catalogPhotoRequests"),
          ),
          visibility: await page.evaluate(() => ({
            visibilityState: document.visibilityState,
            hidden: document.hidden,
            hasFocus: document.hasFocus(),
          })),
        });
        await writeFile(
          resolve(evidence, "axe-studio-catalog-photos.json"),
          JSON.stringify(results, null, 2),
        );
        assert.deepEqual(report.violations, [], `catalogue ${theme}/${mode}`);
        if (mode === "reduced")
          assert.equal(
            await dialog
              .locator(".v-studio-catalog-photo")
              .first()
              .evaluate((node) => getComputedStyle(node).animationName),
            "none",
          );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: resolve(evidence, `catalog-${mode}-${theme}-1440.png`),
        });
        if (mode === "photos") {
          await page.setViewportSize({ width: 1280, height: 720 });
          await until(
            () =>
              dialog
                .locator(".v-studio-catalog-photo-wait")
                .count()
                .then((count) => count === 0),
            10000,
            "1280 photos settled",
          );
          await page.screenshot({
            path: resolve(evidence, `catalog-photos-${theme}-1280.png`),
          });
        }
        const counts = await page.evaluate(() => {
          const requests = Reflect.get(window, "catalogPhotoRequests") as {
            target: { widget: string };
          }[];
          return requests.map((request) => request.target.widget);
        });
        assert.equal(
          new Set(counts).size,
          counts.length,
          "one attempt per kind and opening",
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      } finally {
        await page.close();
      }
    }
  }
}

if (import.meta.main) {
  const { chromium } = await import("playwright-core");
  const { webQaPreview } = await import("./web-qa");
  const evidence =
    process.env.VANTARE_HUB_EVIDENCE ?? "test-results/studio-catalog-photos";
  await mkdir(evidence, { recursive: true });
  const server = await webQaPreview();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ timeout: 15000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    await checkStudioCatalogPhotos(
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
