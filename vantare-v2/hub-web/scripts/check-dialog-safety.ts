import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { calendarScenes } from "./visual-diff/calendar-scenes.ts";
import { launcherScenes } from "./visual-diff/launcher.ts";
import { until } from "./wait-for.ts";

/** Actual keyboard events; canceling their default prevents the OS/browser menu. */
export async function checkProfileContextKeys(page: Page) {
  await page.evaluate(() => {
    const abort = new AbortController();
    Reflect.set(window, "profileContextProbe", abort);
    for (const type of ["keydown", "contextmenu"])
      document.addEventListener(
        type,
        (event) => {
          if (
            event instanceof KeyboardEvent &&
            !(
              event.key === "ContextMenu" ||
              (event.key === "F10" && event.shiftKey)
            )
          )
            return;
          requestAnimationFrame(() => {
            document.documentElement.dataset.profileMenuDefaultPrevented =
              String(event.defaultPrevented);
          });
        },
        { capture: true, signal: abort.signal },
      );
  });
  const card = page.locator(".v-launcher-profile").first();
  try {
    if (await page.getByRole("menu").count())
      await page.keyboard.press("Escape");
    for (const key of ["mouse", "Shift+F10", "ContextMenu"]) {
      await card.focus();
      await page.evaluate(() => {
        delete document.documentElement.dataset.profileMenuDefaultPrevented;
      });
      if (key === "mouse") await card.click({ button: "right" });
      else await page.keyboard.press(key);
      await page.getByRole("menu").waitFor();
      await until(
        () =>
          page.evaluate(
            () =>
              document.documentElement.dataset.profileMenuDefaultPrevented !==
              undefined,
          ),
        5000,
        "native event dispatch completed",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.dataset.profileMenuDefaultPrevented,
        ),
        "true",
        `${key}: native context menu must be suppressed`,
      );
      await page.keyboard.press("Escape");
      await page.getByRole("menu").waitFor({ state: "hidden" });
      await until(
        () => card.evaluate((node) => node === document.activeElement),
        5000,
        "context origin focus",
      );
    }
  } finally {
    await page.evaluate(() =>
      (Reflect.get(window, "profileContextProbe") as AbortController).abort(),
    );
  }
}

/** Runs in the existing Chromium web job, not jsdom, without any new server/dependency. */
export async function openProfileRemovalWithKeyboard(page: Page) {
  await page.locator(".v-launcher-profile").first().focus();
  await page.keyboard.press("Shift+F10");
  const remove = page.getByRole("menuitem", { name: "Eliminar", exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await until(
    () =>
      dialog
        .getByRole("button")
        .first()
        .evaluate((node) => node === document.activeElement),
    5000,
    "keyboard menu hands focus to the first confirmation button",
  );
  return dialog;
}

export async function checkDialogSafety(
  page: Page,
  base: string,
  evidence: string,
) {
  // Closing this page removes its init script and prototype hook completely.
  const isolated = await page.context().newPage();
  try {
    await checkIsolatedDialogs(isolated, base, evidence);
  } finally {
    await isolated.close();
  }
}

/** The real Shell settings path, with an editable field and a nested Select. */
export async function checkDialogZoom(page: Page, base: string) {
  await page.addInitScript(() => {
    Reflect.set(window, "dialogZoomWrites", []);
    Reflect.set(window, "dialogZoomMethods", []);
    // Register before React mounts the safety listener on Window capture.
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key.toLowerCase() === "r" && event.ctrlKey)
          requestAnimationFrame(() => {
            document.documentElement.dataset.dialogReloadPrevented = String(
              event.defaultPrevented,
            );
          });
      },
      true,
    );
    const send = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (message, options) {
      const request = message?.request;
      if (message?.kind === "request")
        (Reflect.get(window, "dialogZoomMethods") as string[]).push(
          request.method,
        );
      if (
        message?.kind === "request" &&
        request?.method === "settings.update" &&
        request.patch?.field === "zoom"
      )
        (Reflect.get(window, "dialogZoomWrites") as number[]).push(
          request.patch.value,
        );
      send.call(
        this,
        message,
        Array.isArray(options) ? { transfer: options } : options,
      );
    };
  });
  await page.goto(
    `${base}?escena=visual-dark:launcher-ready&dialog-fixture=zoom`,
  );
  const trigger = page.getByRole("button", {
    name: "Comprobar zoom del diálogo",
    exact: true,
  });
  await trigger.click();
  const popup = page.getByRole("dialog", {
    name: "Zoom de la ventana",
    exact: true,
  });
  const field = popup.getByRole("textbox", {
    name: "Campo del diálogo",
    exact: true,
  });
  const reset = page.locator(".v-zoom-reset");
  const writes = () =>
    page.evaluate(() => Reflect.get(window, "dialogZoomWrites") as number[]);
  const launches = () =>
    page.evaluate(
      () =>
        (Reflect.get(window, "dialogZoomMethods") as string[]).filter(
          (method) =>
            method === "launcher.favorite" ||
            method === "launcher.launch" ||
            method === "launcher.launchChecked" ||
            method === "launcher.resident.answer" ||
            method === "calendar.launchArm" ||
            method === "calendar.launchCancel",
        ).length,
    );
  const settled = async (value: string) => {
    await until(
      async () =>
        (await reset.textContent()) === value &&
        (await page.locator(".v-zoom").getAttribute("aria-busy")) !== "true",
      5000,
      `zoom ${value} saved through Settings`,
    );
    assert.ok(await popup.isVisible());
    assert.equal(await page.locator(".v-sidebar[inert]").count(), 1);
  };
  await settled("100%");
  await field.focus();
  await page.keyboard.press("Control+=");
  await settled("110%");
  assert.equal(
    await field.evaluate((node) => node === document.activeElement),
    true,
  );
  assert.deepEqual(await writes(), [110]);
  await page.keyboard.press("Control+=");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  assert.deepEqual(await writes(), [110], "112.5% ceiling cannot reach 125%");
  const select = popup.getByRole("combobox", {
    name: "Esquema del diálogo",
    exact: true,
  });
  await select.click();
  const list = page.getByRole("listbox");
  await list.waitFor();
  const nestedFocus = () =>
    page.evaluate(
      () =>
        !!document.activeElement?.closest(
          '[role="listbox"],[role="option"],[role="combobox"]',
        ),
    );
  await page.keyboard.press("Control+NumpadSubtract");
  await settled("100%");
  assert.ok(await list.isVisible());
  assert.ok(await nestedFocus());
  await page.keyboard.press("Control+NumpadAdd");
  await settled("110%");
  // Chromium's headless keypad has NumLock off: Shift yields the logical 0.
  await page.keyboard.press("Control+Shift+Numpad0");
  await settled("100%");
  assert.deepEqual(await writes(), [110, 100, 110, 100]);
  await page.keyboard.press("Control+-");
  await settled("90%");
  await page.keyboard.down("Control");
  try {
    await page.keyboard.down("=");
    await settled("100%");
    await page.keyboard.down("=");
    await settled("110%");
  } finally {
    await page.keyboard.up("=");
    await page.keyboard.up("Control");
  }
  assert.deepEqual(await writes(), [110, 100, 110, 100, 90, 100, 110]);
  assert.ok(await list.isVisible());
  assert.ok(await nestedFocus());
  const sidebar = await page.locator(".v-sidebar").getAttribute("class");
  await page.keyboard.press("Control+l");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+k");
  assert.equal(await launches(), 0);
  assert.equal(await page.locator(".v-sidebar").getAttribute("class"), sidebar);
  assert.equal(await page.locator("[data-command-palette]").count(), 0);
  assert.ok(await list.isVisible());
  await page.evaluate(() => {
    delete document.documentElement.dataset.dialogReloadPrevented;
  });
  await page.keyboard.press("Control+r");
  await until(
    () =>
      page.evaluate(
        () => document.documentElement.dataset.dialogReloadPrevented === "true",
      ),
    5000,
    "Reload remains prevented with nested Select open",
  );
  await page.keyboard.press("Escape");
  await list.waitFor({ state: "hidden" });
  assert.ok(await popup.isVisible());
  assert.equal(
    await select.evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await popup.waitFor({ state: "hidden" });
  await until(
    () => trigger.evaluate((node) => node === document.activeElement),
    5000,
    "zoom dialog returns focus to its trigger",
  );
  await page.keyboard.press("Control+l");
  await until(
    async () => (await launches()) === 1,
    5000,
    "positive control: launch only works after closing the dialog",
  );
}
async function checkIsolatedDialogs(
  page: Page,
  base: string,
  evidence: string,
) {
  await page.addInitScript(() => {
    const methods: string[] = [];
    Reflect.set(window, "dialogRequestMethods", methods);
    const original = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        message &&
        typeof message === "object" &&
        "kind" in message &&
        message.kind === "request" &&
        "request" in message
      ) {
        const request = message.request as { method?: unknown };
        if (typeof request.method === "string") methods.push(request.method);
      }
      original.call(
        this,
        message,
        Array.isArray(options) ? { transfer: options } : options,
      );
    };
  });
  await page.goto(`${base}?escena=visual-dark:launcher-base`);
  await launcherScenes["launcher-base"].prepare(page);
  await checkProfileContextKeys(page);
  const dialog = await openProfileRemovalWithKeyboard(page);
  const firstButton = dialog.getByRole("button").first();
  await until(
    () => firstButton.evaluate((node) => node === document.activeElement),
    5000,
    "first confirmation button receives initial focus",
  );
  const order = await page.evaluate(() => {
    const popup = document.querySelector("[data-window-dialog=screen]");
    const buttons = [
      ...(popup?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
        []),
      ...document.querySelectorAll<HTMLButtonElement>(
        ".v-window-controls button",
      ),
    ];
    return buttons.map((node) => {
      node.dataset.dialogTabId = String(buttons.indexOf(node));
      return node.dataset.dialogTabId;
    });
  });
  await dialog.focus();
  for (const expected of order) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => (document.activeElement as HTMLElement)?.dataset.dialogTabId,
      ),
      expected,
      "caption controls follow every dialog button",
    );
  }
  await page.keyboard.press("Tab");
  assert.ok(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
    `dialog is first in Tab order; active=${await page.evaluate(() => document.activeElement?.outerHTML)}`,
  );
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(
        () =>
          !!document.activeElement?.closest(
            '[data-window-dialog="screen"],.v-window-controls,.v-toast-viewport',
          ),
      ),
      "Tab stays in the confirmation or caption controls",
    );
  }
  const controls = page.locator(".v-window-controls button");
  assert.equal(await controls.count(), 3);
  for (const button of await controls.all()) {
    await button.focus();
    assert.ok(await button.evaluate((node) => node === document.activeElement));
  }
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  assert.ok(
    await dialog.evaluate((node) => node === document.activeElement),
    "focus rescue chooses dialog, not Minimize",
  );
  const behind = page.locator(
    '.v-sidebar button,.v-section-tabs-slot [role="tab"],.v-notification-bell,.v-titlebar-actions button',
  );
  assert.ok(
    (await behind.count()) > 0,
    "background actions fixture is nonempty",
  );
  for (const selector of [
    ".v-sidebar button",
    '.v-section-tabs-slot [role="tab"]',
    ".v-notification-bell",
    ".v-titlebar-actions button",
  ])
    assert.ok(
      await page.locator(selector).count(),
      `${selector}: nonempty fixture`,
    );
  await page.evaluate(() => {
    document.documentElement.dataset.behindClicks = "0";
    for (const node of document.querySelectorAll(
      '.v-sidebar button,.v-section-tabs-slot [role="tab"],.v-notification-bell,.v-titlebar-actions button',
    ))
      node.addEventListener("click", () => {
        document.documentElement.dataset.behindClicks = String(
          Number(document.documentElement.dataset.behindClicks) + 1,
        );
      });
  });
  for (const button of await behind.all()) {
    assert.ok(
      await button.evaluate((node) => !!node.closest("[inert]")),
      "background action is inert",
    );
    const rect = await button.boundingBox();
    if (rect?.width && rect.height)
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.behindClicks),
    "0",
  );
  await dialog.focus();
  await page.keyboard.press("Control+l");
  assert.equal(
    await page.evaluate(
      () =>
        (Reflect.get(window, "dialogRequestMethods") as string[]).filter(
          (method) =>
            method === "launcher.launch" ||
            method === "calendar.launchArm" ||
            method === "calendar.launchCancel" ||
            method === "launcher.launchChecked" ||
            method === "launcher.resident.answer" ||
            method === "launcher.favorite",
        ).length,
    ),
    0,
    "Ctrl L sends no launch request",
  );
  const rail = await page.locator(".v-context").getAttribute("class");
  await page.keyboard.press("Control+Alt+b");
  assert.equal(await page.locator(".v-context").getAttribute("class"), rail);
  await dialog.waitFor();
  await page.screenshot({
    path: resolve(evidence, "dialog-profile-safety.png"),
  });
  await page.keyboard.press("Escape");
  await until(
    () => dialog.count().then((count) => count === 0),
    5000,
    "profile confirmation closes",
  );

  await page.keyboard.press("Control+l");
  assert.equal(
    await page.evaluate(
      () =>
        (Reflect.get(window, "dialogRequestMethods") as string[]).filter(
          (method) =>
            method === "launcher.favorite" ||
            method === "launcher.launch" ||
            method === "launcher.launchChecked" ||
            method === "launcher.resident.answer" ||
            method === "calendar.launchArm" ||
            method === "calendar.launchCancel",
        ).length,
    ),
    1,
    "positive control: Ctrl L launches exactly once without a dialog",
  );

  await page.goto(`${base}?escena=visual-dark:calendar-launch-reference`);
  await calendarScenes["calendario-proximas-contraida"].prepare(page);
  const calendarIntents = () =>
    page.evaluate(
      () =>
        (Reflect.get(window, "dialogRequestMethods") as string[]).filter(
          (method) =>
            method === "launcher.favorite" ||
            method === "launcher.launch" ||
            method === "launcher.launchChecked" ||
            method === "launcher.resident.answer" ||
            method === "calendar.launchArm" ||
            method === "calendar.launchCancel",
        ).length,
    );
  await page.getByRole("button", { name: /Lanzar a las/u }).click();
  await until(
    async () => (await calendarIntents()) === 1,
    5000,
    "positive calendar arm is counted",
  );
  await page
    .getByRole("button", { name: "Cancelar lanzamiento puntual", exact: true })
    .click();
  await until(
    async () => (await calendarIntents()) === 2,
    5000,
    "positive calendar cancellation is counted",
  );

  await page.goto(`${base}?escena=visual-dark:ajustes-con-diseno`);
  await page.locator('.v-search input[type="search"]').waitFor();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog").getByRole("combobox");
  await search.focus();
  assert.equal(
    await search.evaluate((node) => {
      const event = new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
    "Ctrl Alt B is blocked even in editable fields",
  );
  // Linux CI has no Spanish OS keyboard layout. Assert the cancelable AltGr
  // keydown first, then insert its text through Chromium's input pipeline.
  assert.equal(
    await search.evaluate((node) => {
      const event = new KeyboardEvent("keydown", {
        key: "@",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    false,
  );
  await page.keyboard.insertText("@");
  assert.equal(await search.inputValue(), "@");
  await page.keyboard.press("Control+k");
  await until(
    () =>
      page
        .getByRole("dialog")
        .count()
        .then((count) => count === 0),
    5000,
    "Ctrl K closes the top palette",
  );

  await checkDialogZoom(page, base);
  await page.goto(`${base}?escena=specimen`);
  await page
    .getByRole("button", { name: "Abrir diálogo", exact: true })
    .click();
  const parent = page.getByRole("dialog");
  const select = parent.getByRole("combobox", { name: "Esquema del diálogo" });
  await select.click();
  await page.getByRole("listbox").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("listbox").waitFor({ state: "hidden" });
  assert.equal(await parent.count(), 1);
  assert.ok(await select.evaluate((node) => node === document.activeElement));
  await page.keyboard.press("Escape");
  await until(
    () => parent.count().then((count) => count === 0),
    5000,
    "second Escape closes parent",
  );
  await writeFile(
    resolve(evidence, "dialog-safety.json"),
    JSON.stringify(
      {
        profileTabCycle: true,
        inertBackgroundClicks: true,
        noLaunch: true,
        dialogFirst: true,
        captionControls: true,
        captionControlsLast: true,
        positiveLaunch: true,
        ctrlAltB: true,
        nonEmptyBackground: true,
        initialFocusFirstButton: true,
        isolatedInstrumentation: true,
        contextMenuDefaultsCanceled: true,
        altGr: true,
        ctrlKToggle: true,
        nestedSelectEscape: true,
        nestedDialogZoom: true,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  const { mkdir } = await import("node:fs/promises");
  const { chromium } = await import("playwright-core");
  const { webQaPreview } = await import("./web-qa.ts");
  const evidence = resolve(
    process.env.VANTARE_HUB_EVIDENCE ?? "test-results/dialog-safety",
  );
  await mkdir(evidence, { recursive: true });
  const server = await webQaPreview();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await checkDialogSafety(
      page,
      server.resolvedUrls?.local[0] ?? "",
      evidence,
    );
    const { checkCalendarDialogSafety } = await import(
      "./check-calendar-dialog-safety.ts"
    );
    await checkCalendarDialogSafety(page, server.resolvedUrls?.local[0] ?? "");
  } finally {
    await browser.close();
    await new Promise<void>((done, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : done())),
    );
  }
}
