import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { calendarScenes } from "./visual-diff/calendar-scenes.ts";
import { until } from "./wait-for.ts";

/** Runs against Chromium, whose inert/focus behavior jsdom cannot reproduce. */
export async function checkCalendarDialogSafety(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(() => {
      const original = MessagePort.prototype.postMessage;
      Reflect.set(window, "calendarLaunches", 0);
      MessagePort.prototype.postMessage = function (message, options) {
        if (
          message?.kind === "request" &&
          message.request?.method === "launcher.launch"
        )
          Reflect.set(
            window,
            "calendarLaunches",
            Number(Reflect.get(window, "calendarLaunches")) + 1,
          );
        original.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    await page.goto(`${base}?escena=visual-dark:calendar-live-reference`);
    await calendarScenes["calendario-avisos-contraida"].prepare(page);
    const dialog = page.getByRole("dialog", { name: "Avisos", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute("data-window-dialog"), "screen");
    assert.ok(await dialog.locator("button,input").count());
    await dialog.focus();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(
          () =>
            !!document.activeElement?.closest(
              '[data-window-dialog="screen"],.v-window-controls,[data-base-ui-portal],.v-toast',
            ),
        ),
        "Tab must remain in the dialog or window controls",
      );
    }
    await page.keyboard.press("Control+l");
    assert.equal(
      await page.evaluate(() => Reflect.get(window, "calendarLaunches")),
      0,
    );
    assert.ok(await page.locator(".v-sidebar[inert]").count());
    await page.keyboard.press("Escape");
    await until(
      async () => (await dialog.count()) === 0,
      5000,
      "Avisos closes with Escape",
    );
    assert.equal(await page.locator(".v-sidebar[inert]").count(), 0);
    assert.ok(
      await page.evaluate(() =>
        document.activeElement?.textContent?.includes("Avisos"),
      ),
    );
    for (const scene of [
      "calendario-ficha-contraida",
      "calendario-ics-contraida",
      "calendario-dia-ampliada",
      "calendario-semana-ampliada",
      "calendario-mes-ampliada",
    ]) {
      await page.goto(`${base}?escena=visual-dark:calendar-live-reference`);
      await calendarScenes[scene].prepare(page);
      const popup = page.locator('[data-window-dialog="screen"]');
      await popup.waitFor();
      await popup.focus();
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        assert.ok(
          await page.evaluate(
            () =>
              !!document.activeElement?.closest(
                '[data-window-dialog="screen"],.v-window-controls,[data-base-ui-portal],.v-toast',
              ),
          ),
          `${scene}: Tab stays in its focus scope`,
        );
      }
      await page.keyboard.press("Escape");
      await until(
        async () => (await popup.count()) === 0,
        5000,
        `${scene}: Escape closes`,
      );
      assert.equal(await page.locator(".v-sidebar[inert]").count(), 0);
    }
    await page.goto(`${base}?escena=launcher-aplicaciones`);
    await page.getByRole("button", { name: "Launcher", exact: true }).click();
    await page.getByRole("tab", { name: "Aplicaciones", exact: true }).click();
    const origin = page.getByRole("button", {
      name: "Editar OBS Studio",
      exact: true,
    });
    await origin.click();
    const editor = page.locator(".v-launcher-app-drawer");
    await editor.waitFor();
    assert.equal(await editor.getAttribute("data-window-dialog"), "screen");
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(
          () =>
            !!document.activeElement?.closest(
              '[data-window-dialog="screen"],.v-window-controls,.v-toast',
            ),
        ),
        "Application editor traps focus",
      );
    }
    await page.keyboard.press("Escape");
    await until(
      async () => (await editor.count()) === 0,
      5000,
      "Application editor closes",
    );
    await until(
      () => origin.evaluate((node) => node === document.activeElement),
      5000,
      "Application editor restores focus",
    );
  } finally {
    await page.close();
  }
}
