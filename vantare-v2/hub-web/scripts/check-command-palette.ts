import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { until } from "./wait-for.ts";

export async function checkCommandPalette(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(() => {
      const original = MessagePort.prototype.postMessage;
      Reflect.set(window, "paletteLaunchRequests", []);
      MessagePort.prototype.postMessage = function (message, options) {
        if (
          message?.kind === "request" &&
          message.request?.method === "launcher.launch"
        )
          (Reflect.get(window, "paletteLaunchRequests") as unknown[]).push(
            message.request,
          );
        original.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    await page.goto(`${base}?escena=visual-dark:launcher-ready`);
    await page.locator('.v-search input[type="search"]').waitFor();
    await page.keyboard.press("Control+k");
    const search = page.locator("[data-command-palette]");
    await search.fill("Lanzar Pro");
    const profile = page.getByRole("option", { name: /Lanzar Pro/ });
    await profile.waitFor();
    await until(
      async () => (await profile.getAttribute("aria-disabled")) !== "true",
      5000,
      "Profiles have finished loading",
    );
    await until(
      async () => (await profile.getAttribute("data-highlighted")) !== null,
      5000,
      "Filtered profile is highlighted",
    );
    await page.keyboard.press("Enter");
    await until(
      async () => (await page.locator(".v-command-palette").count()) === 0,
      5000,
      "Profile command closes the palette",
    );
    await until(
      () =>
        page.evaluate(
          () =>
            (Reflect.get(window, "paletteLaunchRequests") as unknown[])
              .length === 1,
        ),
      5000,
      "One launch request",
    );
    assert.deepEqual(
      await page.evaluate(() => Reflect.get(window, "paletteLaunchRequests")),
      [
        {
          method: "launcher.launch",
          profile: "pro",
          baseRevision: "0".repeat(64),
        },
      ],
    );
    await page.keyboard.press("Control+k");
    await search.fill("Lanzar Pro");
    await until(
      async () => (await profile.getAttribute("aria-disabled")) === "true",
      5000,
      "Active chain blocks relaunch",
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(
        () =>
          (Reflect.get(window, "paletteLaunchRequests") as unknown[]).length,
      ),
      1,
    );
    await page.keyboard.press("Escape");
  } finally {
    await page.close();
  }
}

if (import.meta.main) {
  const { chromium } = await import("playwright-core");
  const { webQaPreview } = await import("./web-qa.ts");
  const server = await webQaPreview();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await checkCommandPalette(page, server.resolvedUrls?.local[0] ?? "");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
