import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import { calendarScenes } from "./visual-diff/calendar-scenes.ts";
import { until } from "./wait-for.ts";

async function launchCount(page: Page) {
  return page.evaluate(() => Number(Reflect.get(window, "calendarLaunches")));
}
async function noLaunch(page: Page, popup: Locator) {
  assert.equal(
    await launchCount(page),
    0,
    "isolated scene starts without launches",
  );
  const button = popup.locator("button:not(:disabled)").first();
  assert.ok(
    await button.count(),
    "non-editable popup control exists for the shortcut check",
  );
  await button.focus();
  await page.keyboard.press("Control+l");
  assert.equal(
    await launchCount(page),
    0,
    "no launcher.favorite, launcher.launch or launcher.launchChecked escapes the dialog",
  );
  const background=page.locator(".v-sidebar").getByRole("button",{name:"Calendario",exact:true,includeHidden:true});
  if(await background.count()) {const box=await background.boundingBox();if(box)await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}
  await page.keyboard.press("Tab");
  assert.equal(await launchCount(page),0,"background click and Tab cannot arm or cancel");
  assert.ok(await popup.isVisible());
}
async function positiveLaunch(page: Page) {
  assert.equal(
    await page.locator(".v-sidebar[inert]").count(),
    0,
    "normal screen is not inert",
  );
  await page.keyboard.press("Control+l");
  await until(
    async () => (await launchCount(page)) === 1,
    5000,
    "positive Ctrl L sends one launch request on the normal screen",
  );
}
async function boundaryCycle(page: Page, popup: Locator) {
  assert.equal(
    await page.locator(".v-sidebar").count(),
    1,
    "sidebar control exists",
  );
  assert.equal(
    await page.locator(".v-sidebar[inert]").count(),
    1,
    "sidebar is inert while the popup is open",
  );
  const first = await popup.evaluate((node) => {
    const target = [
      ...node.querySelectorAll<HTMLElement>(
        "button,input,textarea,select,a[href],[tabindex]",
      ),
    ].find((item) => {
      const saved = item.getAttribute("data-tabindex");
      return (
        !item.matches(":disabled") &&
        !item.closest('[hidden],[aria-hidden="true"],[inert]') &&
        item.getClientRects().length > 0 &&
        (item.tabIndex >= 0 || (saved !== null && Number(saved) >= 0))
      );
    });
    if (!target) return false;
    target.dataset.calendarCycleFirst = "true";
    target.focus();
    return target === document.activeElement;
  });
  assert.ok(first, "first enabled popup control exists and receives focus");
  const origin = popup.locator('[data-calendar-cycle-first="true"]');
  const last = page.locator(".v-window-controls button").last();
  assert.equal(
    await page.locator(".v-window-controls button").count(),
    3,
    "three caption controls exist",
  );
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await last.evaluate((node) => node === document.activeElement),
    "reverse boundary goes to the final caption control",
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await origin.evaluate((node) => node === document.activeElement),
    "forward boundary returns to the first popup control",
  );
}
async function scene(page: Page, base: string, name: string) {
  await page.goto(`${base}?escena=visual-dark:calendar-launch-reference`);
  await until(
    async () => (await page.locator(".v-sidebar").count()) === 1,
    5000,
    "normal shell is present",
  );
  assert.equal(
    await page.locator(".v-sidebar[inert]").count(),
    0,
    "sidebar is interactive before opening",
  );
  await calendarScenes[name].prepare(page);
}

/** Chromium exercises actual inert, both launch methods and both focus-cycle boundaries. */
export async function checkCalendarDialogSafety(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(() => {
      const original = MessagePort.prototype.postMessage;
      Reflect.set(window, "calendarLaunches", 0);
      MessagePort.prototype.postMessage = function (message, options) {
        if (
          message?.kind === "request" &&
          [
            "launcher.launch",
            "launcher.launchChecked",
            "calendar.launchArm",
            "calendar.launchCancel",
            "launcher.favorite",
          ].includes(message.request?.method)
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
    for (const name of [
      "calendario-avisos-contraida",
      "calendario-ficha-contraida",
      "calendario-ics-contraida",
      "calendario-dia-ampliada",
      "calendario-semana-ampliada",
      "calendario-mes-ampliada",
    ]) {
      await scene(page, base, name);
      const popup = page.locator('[data-window-dialog="screen"]');
      await popup.waitFor();
      assert.equal(await popup.count(), 1);
      await boundaryCycle(page, popup);
      await noLaunch(page, popup);
      await page.keyboard.press("Escape");
      await until(
        async () => (await popup.count()) === 0,
        5000,
        `${name}: Escape closes`,
      );
      await positiveLaunch(page);
    }

    // Positive arm/cancel verifies that both new methods are really counted.
    await scene(page,base,"calendario-proximas-contraida");
    await page.getByRole("button",{name:/Lanzar a las/u}).click();
    await until(async()=>await launchCount(page)===1,5000,"positive calendar.launchArm");
    await page.getByRole("button",{name:"Cancelar lanzamiento puntual",exact:true}).click();
    await until(async()=>await launchCount(page)===2,5000,"positive calendar.launchCancel");
    await page.getByRole("button",{name:/Lanzar a las/u}).focus();
    await page.keyboard.press("Tab");
    assert.equal(await launchCount(page),2,"Tab does not arm again");

    // Actual nested route: expand Day, open a departure chip, return to that chip.
    await scene(page, base, "calendario-dia-ampliada");
    const expanded = page.locator(".v-calendar-day-full");
    const chip = expanded.locator("button[data-next]").first();
    assert.ok(await chip.count(), "expanded calendar has a departure chip");
    await chip.focus();
    await chip.click();
    const detail = page.locator(".v-calendar-detail");
    await detail.waitFor();
    assert.equal(
      await page.locator('[data-window-dialog="screen"]').count(),
      2,
    );
    assert.ok(
      await expanded.evaluate((node) => node.hasAttribute("inert")),
      "expanded parent is inert under the detail",
    );
    await boundaryCycle(page, detail);
    await noLaunch(page, detail);
    await page.keyboard.press("Escape");
    await until(
      async () => (await detail.count()) === 0,
      5000,
      "detail closes above expanded Day",
    );
    await until(
      () => chip.evaluate((node) => node === document.activeElement),
      5000,
      "Escape restores the actual departure chip",
    );
    assert.ok(!(await expanded.evaluate((node) => node.hasAttribute("inert"))));
    await page.keyboard.press("Escape");
    await until(
      async () => (await expanded.count()) === 0,
      5000,
      "expanded Day closes",
    );
    await positiveLaunch(page);

    // Actual nested route: detail opens ICS, Cancel restores its export button.
    await scene(page, base, "calendario-ficha-contraida");
    const exportButton = detail.getByRole("button", {
      name: "Añadir a mi calendario",
      exact: true,
    });
    await exportButton.focus();
    await exportButton.click();
    const ics = page.getByRole("dialog", {
      name: "Añadir a mi calendario",
      exact: true,
    });
    await ics.waitFor();
    assert.equal(
      await page.locator('[data-window-dialog="screen"]').count(),
      2,
    );
    assert.ok(await detail.evaluate((node) => node.hasAttribute("inert")));
    await boundaryCycle(page, ics);
    await noLaunch(page, ics);
    await ics.getByRole("button", { name: "Cancelar", exact: true }).click();
    await until(
      async () => (await ics.count()) === 0,
      5000,
      "Cancel closes only ICS",
    );
    assert.equal(await detail.count(), 1);
    await until(
      () => exportButton.evaluate((node) => node === document.activeElement),
      5000,
      "Cancel restores the actual export origin",
    );
    assert.ok(!(await detail.evaluate((node) => node.hasAttribute("inert"))));
    await page.keyboard.press("Escape");
    await until(
      async () => (await detail.count()) === 0,
      5000,
      "detail closes after ICS",
    );
    await positiveLaunch(page);

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
    await boundaryCycle(page, editor);
    await noLaunch(page, editor);
    await page.keyboard.press("Escape");
    await until(
      async () => (await editor.count()) === 0,
      5000,
      "application editor closes",
    );
    await until(
      () => origin.evaluate((node) => node === document.activeElement),
      5000,
      "application editor restores origin",
    );
    await positiveLaunch(page);
  } finally {
    await page.close();
  }
}
