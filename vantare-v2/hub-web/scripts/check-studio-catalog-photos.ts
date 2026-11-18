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
  const drawings = JSON.parse(
    await readFile(
      new URL("../fixtures/preview-catalog.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { svg: string; width: number; height: number }>;
  const painter = await parent.context().newPage();
  let images: Record<
    string,
    { width: number; height: number; pngBase64: string }
  >;
  try {
    images = await painter.evaluate(async (drawings) => {
      const images: Record<
        string,
        { width: number; height: number; pngBase64: string }
      > = {};
      for (const [kind, { svg, width, height }] of Object.entries(drawings)) {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw Error("QA canvas unavailable");
        context.drawImage(image, 0, 0);
        images[kind] = {
          width,
          height,
          pngBase64: canvas.toDataURL("image/png").split(",")[1],
        };
      }
      return images;
    }, drawings);
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
          ({ images, theme, mode }) => {
            const send = MessagePort.prototype.postMessage;
            const catalogIds = new Map<number, string>();
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
                catalogIds.set(message.id, message.request.target.widget);
                requests.push(message.request);
              }
              if (
                (message?.kind === "response" || message?.kind === "failure") &&
                catalogIds.has(message.id)
              ) {
                const image = images[catalogIds.get(message.id) ?? ""];
                catalogIds.delete(message.id);
                const response = {
                  kind: "response",
                  id: message.id,
                  result: {
                    method: "preview.render",
                    value: image,
                  },
                };
                const failure = {
                  kind: "failure",
                  id: message.id,
                  error: { kind: "previewFailed", reason: "noDemo" },
                };
                if (mode === "noDemo" || !image) message = failure;
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
          { images, theme, mode },
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
              label: node.getAttribute("aria-label") ?? "",
              name: node
                .querySelector("strong")
                ?.firstChild?.textContent?.trim(),
              about: node.querySelector("small")?.textContent?.trim(),
              owned: node
                .querySelector(".v-studio-owned")
                ?.getAttribute("data-label"),
            })),
          );
        for (const card of labels) {
          // Label in Name: the action comes first and the visible text follows.
          assert.equal(
            card.label.startsWith(`${studioText.addShort} ${card.name}`),
            true,
            `${card.kind} name starts with the action`,
          );
          assert.equal(
            card.label.includes(card.about ?? ""),
            true,
            `${card.kind} name repeats its visible description`,
          );
          if (card.owned)
            assert.equal(
              card.label.includes(card.owned),
              true,
              `${card.kind} name repeats its owned badge`,
            );
        }
        assert.equal(
          await dialog.locator(".v-studio-catalog-photo-legend").count(),
          mode === "noDemo" ? 0 : 1,
          "legend exists only with a photo",
        );
        if (mode === "scrolled") {
          assert(
            await body.evaluate(
              (node) => node.scrollHeight > node.clientHeight,
            ),
            "positive scroll control",
          );
          await body.evaluate(
            (node) =>
              new Promise<void>((done) => {
                node.addEventListener("scrollend", () => done(), {
                  once: true,
                });
                node.scrollTop = node.scrollHeight;
              }),
          );
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
        if (mode === "photos") {
          const badges = await dialog.evaluate((node) => {
            const rgba = (value: string) => {
              const [r, g, b, a = 1] = (value.match(/[\d.]+/g) ?? []).map(
                Number,
              );
              return { r, g, b, a };
            };
            const channel = (value: number) => {
              const part = value / 255;
              return part <= 0.03928
                ? part / 12.92
                : ((part + 0.055) / 1.055) ** 2.4;
            };
            const luminance = (color: { r: number; g: number; b: number }) =>
              0.2126 * channel(color.r) +
              0.7152 * channel(color.g) +
              0.0722 * channel(color.b);
            const scroll = node
              .querySelector(".v-studio-catalog-body")
              ?.getBoundingClientRect();
            const found: {
              kind: string | null;
              opaque: boolean;
              ratio: number;
              above: boolean | null;
            }[] = [];
            for (const badge of node.querySelectorAll(".v-studio-owned")) {
              const card = badge.closest(".v-studio-catalog-widget");
              if (!card?.querySelector(".v-studio-catalog-photo img")) continue;
              const style = getComputedStyle(badge);
              const front = luminance(rgba(style.color));
              const back = rgba(style.backgroundColor);
              const box = badge.getBoundingClientRect();
              const x = box.x + box.width / 2;
              const y = box.y + box.height / 2;
              const onScreen =
                !!scroll &&
                y >= scroll.top &&
                y <= scroll.bottom &&
                x >= scroll.left &&
                x <= scroll.right;
              found.push({
                kind: card.getAttribute("data-kind"),
                opaque: back.a === 1,
                ratio:
                  (Math.max(front, luminance(back)) + 0.05) /
                  (Math.min(front, luminance(back)) + 0.05),
                above: onScreen
                  ? (() => {
                      const stack = document.elementsFromPoint(x, y);
                      const badgeAt = stack.indexOf(badge);
                      const photoAt = stack.findIndex(
                        (element) =>
                          element.tagName === "IMG" ||
                          element.classList.contains("v-studio-catalog-photo"),
                      );
                      return (
                        badgeAt >= 0 && (photoAt === -1 || badgeAt < photoAt)
                      );
                    })()
                  : null,
              });
            }
            return found;
          });
          assert(
            badges.length > 0,
            "positive control: an owned badge sits over a catalogue photo",
          );
          for (const badge of badges) {
            assert.equal(
              badge.opaque,
              true,
              `${badge.kind} badge stays opaque over its photo`,
            );
            assert.ok(
              badge.ratio >= 4.5,
              `${badge.kind} badge contrast over its photo ${badge.ratio.toFixed(2)}:1`,
            );
          }
          assert(
            badges.some((badge) => badge.above === true),
            "an owned badge paints above its catalogue photo",
          );
          const fits = await dialog.evaluate((node) =>
            Array.from(node.querySelectorAll(".v-studio-catalog-photo")).map(
              (photo) => {
                const img = photo.querySelector("img");
                if (!img) throw Error("Missing catalogue photo");
                const frame = photo.getBoundingClientRect();
                const box = img.getBoundingClientRect();
                return {
                  kind: img.closest("[data-kind]")?.getAttribute("data-kind"),
                  inside:
                    box.left >= frame.left - 0.5 &&
                    box.right <= frame.right + 0.5 &&
                    box.top >= frame.top - 0.5 &&
                    box.bottom <= frame.bottom + 0.5,
                  aspect:
                    Math.abs(
                      box.width / box.height -
                        img.naturalWidth / img.naturalHeight,
                    ) < 0.02,
                  grew:
                    box.width > img.naturalWidth + 0.5 ||
                    box.height > img.naturalHeight + 0.5,
                  natural: [img.naturalWidth, img.naturalHeight],
                  painted: [Math.round(box.width), Math.round(box.height)],
                };
              },
            ),
          );
          assert(fits.length > 0, "positive control: catalogue photos mounted");
          for (const fit of fits) {
            assert.equal(
              fit.inside,
              true,
              `${fit.kind} photo fits inside the 92px zone (${fit.natural.join("x")} -> ${fit.painted.join("x")})`,
            );
            assert.equal(
              fit.aspect,
              true,
              `${fit.kind} photo keeps its aspect ratio`,
            );
            assert.equal(fit.grew, false, `${fit.kind} photo is not upscaled`);
          }
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
