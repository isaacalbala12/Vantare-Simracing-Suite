import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { until } from "./wait-for.ts";

/** Real inert/focus and the real Shell registrations, never just attributes. */
export async function checkNotificationFocus(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(() => {
      const send = MessagePort.prototype.postMessage;
      Reflect.set(window, "noticeFocusRequests", []);
      MessagePort.prototype.postMessage = function (message, options) {
        if (message?.kind === "request")
          (Reflect.get(window, "noticeFocusRequests") as unknown[]).push(
            message.request,
          );
        send.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    await page.goto(`${base}?escena=visual-dark:launcher-ready`);
    await page.locator('.v-search input[type="search"]').waitFor();
    const sidebar = page.locator(".v-sidebar"),
      before = await sidebar.getAttribute("class");
    const bell = page.locator(".v-notification-bell");
    await bell.click();
    const popup = page.getByRole("dialog", {
      name: "Notificaciones",
      exact: true,
    });
    await popup.waitFor();
    const first = popup.locator("button:enabled").first();
    assert.ok(
      await popup.locator("button:enabled").count(),
      "Positive control: popup has focusable actions",
    );
    assert.ok(
      await page.locator(".v-window-controls button").count(),
      "Positive control: caption controls exist",
    );
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator(".v-window-controls button")
        .last()
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await first.evaluate((node) => node === document.activeElement),
      true,
    );
    assert.equal(
      await popup.evaluate((node) => !!node.closest("[inert]")),
      false,
    );
    assert.equal(
      await sidebar.evaluate((node) => node.hasAttribute("inert")),
      true,
    );
    const launchCount = () =>
      page.evaluate(
        () =>
          (
            Reflect.get(window, "noticeFocusRequests") as { method: string }[]
          ).filter(
            ({ method }) =>
              method === "launcher.launch" || method === "launcher.favorite",
          ).length,
      );
    assert.equal(await launchCount(), 0);
    for (const key of [
      "Control+l",
      "Control+b",
      "Control+k",
      "Control+Shift+n",
    ])
      await page.keyboard.press(key);
    assert.equal(
      await launchCount(),
      0,
      "Neither launch method can escape the bell",
    );
    assert.equal(
      await sidebar.getAttribute("class"),
      before,
      "Sidebar shortcut remains suspended",
    );
    assert.equal(
      await page.locator("[data-command-palette]").count(),
      0,
      "Palette shortcut remains suspended",
    );
    assert.equal(
      await popup.isVisible(),
      true,
      "Notification shortcut does not dismiss the active layer",
    );
    await sidebar
      .locator("button")
      .first()
      .evaluate((node) => node.focus());
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest(".v-popup,.v-window-controls"),
      ),
      true,
      "Real inert prevents focusing the underlying navigation",
    );
    assert.equal(
      await page.locator(".v-window-controls").evaluate((node) => {
        if (node.closest("[inert]")) return false;
        const rect = node.getBoundingClientRect();
        return !!document
          .elementFromPoint(rect.right - 20, rect.top + rect.height / 2)
          ?.closest(".v-window-controls");
      }),
      true,
      "Caption remains reachable and uncovered",
    );
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    await until(
      () => bell.evaluate((node) => node === document.activeElement),
      5000,
      "Escape restores the bell",
    );
    assert.equal(
      await sidebar.evaluate((node) => node.hasAttribute("inert")),
      false,
    );
    await page.locator(".v-sidebar button").first().focus();
    await page.keyboard.press("Control+l");
    await until(
      async () => (await launchCount()) === 1,
      5000,
      "Positive control: normal Ctrl L sends one request",
    );
  } finally {
    await page.close();
  }
}

if (import.meta.main) {
  const { chromium } = await import("playwright-core");
  const { webQaPreview } = await import("./web-qa.ts");
  const server = await webQaPreview();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await checkNotificationFocus(page, server.resolvedUrls?.local[0] ?? "");
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
