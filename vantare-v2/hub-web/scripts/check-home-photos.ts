import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, chromium, type Page } from "playwright-core";
import drawings from "../fixtures/preview-home.json";
import type { HomeView, StudioView } from "../src/contract/generated/contract";
import { homeText } from "../src/renderer/i18n/home";
import { webQaPreview } from "./web-qa";

export async function checkHomePhotos(
  parent: Page,
  base: string,
  evidence?: string,
) {
  const context = parent.context();
  const painter = await context.newPage();
  const images = await painter
    .evaluate(async (fixtures) => {
      return Promise.all(
        fixtures.map(async ({ svg, ...bounds }) => {
          const image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = bounds.width;
          canvas.height = bounds.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("QA canvas unavailable");
          ctx.drawImage(image, 0, 0);
          return {
            ...bounds,
            pngBase64: canvas.toDataURL("image/png").split(",")[1],
          };
        }),
      );
    }, drawings)
    .finally(() => painter.close());
  const cases = [
    { mode: "fotos", scheme: "dark", width: 1440, height: 900 },
    { mode: "fotos", scheme: "light", width: 1440, height: 900 },
    { mode: "respaldo", scheme: "dark", width: 1440, height: 900 },
    { mode: "respaldo", scheme: "light", width: 1440, height: 900 },
    { mode: "fotos", scheme: "dark", width: 1280, height: 720 },
    { mode: "limite", scheme: "dark", width: 1440, height: 900 },
    { mode: "catalogo", scheme: "dark", width: 1440, height: 900 },
  ] as const;
  const results = [];
  for (const { mode, scheme, width, height } of cases) {
    if (!evidence && width === 1280) continue;
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width, height });
      if (width === 1280) await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ({ mode, scheme, images }) => {
          const send = MessagePort.prototype.postMessage;
          const previews = new Map<number, string>();
          const calls: string[] = [];
          Reflect.set(window, "homePhotoCalls", calls);
          MessagePort.prototype.postMessage = function (message, options) {
            if (message?.kind === "hello")
              message = { ...message, theme: { ...message.theme, scheme } };
            if (message?.kind === "request") {
              if (message.request.method === "studio.get")
                calls.push("studio.get");
              if (message.request.method === "preview.render") {
                const target = message.request.target;
                previews.set(
                  message.id,
                  target.kind === "instance" ? target.id : target.widget,
                );
                calls.push("preview.render");
              }
            }
            if (message?.kind === "response") {
              if (message.result.method === "settings.get")
                message.result.value.appearance.scheme = scheme;
              if (message.result.method === "home.get" && mode === "limite") {
                const view = message.result.value as HomeView;
                view.layout.widgets = Array.from(
                  { length: 9 },
                  () => view.layout.widgets[0],
                );
              }
              if (
                message.result.method === "studio.get" &&
                mode !== "catalogo"
              ) {
                const view = message.result.value as StudioView;
                for (const item of view.instances) {
                  const photo = images.find(
                    (image) => image.kind === item.kind,
                  );
                  if (!photo) continue;
                  item.x = photo.x;
                  item.y = photo.y;
                  item.size = { width: photo.width, height: photo.height };
                  photosById.set(item.id, photo);
                }
              }
            }
            if (
              (message?.kind === "response" || message?.kind === "failure") &&
              previews.has(message.id)
            ) {
              const photo = photosById.get(previews.get(message.id) ?? "");
              previews.delete(message.id);
              if (mode === "fotos" && photo) {
                const { width, height, pngBase64 } = photo;
                message = {
                  kind: "response",
                  id: message.id,
                  result: {
                    method: "preview.render",
                    value: { width, height, pngBase64 },
                  },
                };
              } else {
                message = {
                  kind: "failure",
                  id: message.id,
                  error: { kind: "previewFailed", reason: "noDemo" },
                };
              }
            }
            send.call(this, message, options as StructuredSerializeOptions);
          };
          const photosById = new Map<string, (typeof images)[number]>();
        },
        { mode, scheme, images },
      );
      await page.goto(`${base}?escena=preview-image`);
      if (mode === "catalogo") {
        await page
          .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
          .click();
        await page
          .getByRole("button", { name: "Añadir widget", exact: true })
          .click();
        await page.locator(".v-studio-catalog-widget").first().waitFor();
        assert.equal(
          await page.locator(".v-studio-catalog-photo-legend").count(),
          0,
        );
      } else {
        await page.getByRole("button", { name: "Inicio", exact: true }).click();
        const preview = page.locator(".v-home-preview");
        const seal = page.locator(".v-home-photo-seal");
        await seal
          .getByText(mode === "fotos" ? homeText.photos : homeText.drawing, {
            exact: true,
          })
          .waitFor();
        const labels = await preview
          .getByRole("img")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label")),
          );
        assert.equal(labels.length, mode === "limite" ? 9 : 4);
        assert(
          labels.every(Boolean),
          "Every widget has its original accessible name",
        );
        assert.equal(
          await preview.locator(".v-home-photo-layer img").count(),
          mode === "fotos" ? 4 : 0,
        );
        assert.equal(
          await page
            .getByRole("status")
            .filter({ hasText: homeText.photosReady })
            .count(),
          mode === "fotos" ? 1 : 0,
        );
        if (mode === "respaldo")
          await page.waitForFunction(() =>
            (Reflect.get(window, "homePhotoCalls") as string[]).includes(
              "preview.render",
            ),
          );
        const calls = await page.evaluate(
          () => Reflect.get(window, "homePhotoCalls") as string[],
        );
        assert.deepEqual(
          calls,
          mode === "limite"
            ? []
            : [
                "studio.get",
                ...Array<string>(mode === "fotos" ? 4 : 1).fill(
                  "preview.render",
                ),
              ],
        );
      }
      const { violations } = await new AxeBuilder({ page }).analyze();
      results.push({ mode, scheme, width, height, violations });
      if (evidence) {
        await writeFile(
          join(evidence, "axe-home-photos.json"),
          JSON.stringify(results, null, 2),
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: join(evidence, `${mode}-${scheme}-${width}.png`),
          animations: "disabled",
        });
      }
      assert.deepEqual(
        violations,
        [],
        `Home photos ${mode}/${scheme}/${width}`,
      );
    } finally {
      await page.close();
    }
  }
}

if (import.meta.main) {
  const evidence = process.env.VANTARE_HUB_EVIDENCE;
  if (!evidence) throw new Error("Set VANTARE_HUB_EVIDENCE in the QA launcher");
  await mkdir(evidence, { recursive: true });
  const server = await webQaPreview();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    await checkHomePhotos(
      await context.newPage(),
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
