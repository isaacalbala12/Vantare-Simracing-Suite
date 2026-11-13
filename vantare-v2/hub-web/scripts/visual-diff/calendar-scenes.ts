import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";

async function assertDetailWindowControls(page: Page) {
  // Visibility precedes Base UI's queued autofocus (microtask + animation frame).
  // Let the top dialog acquire its initial focus before moving it to the caption;
  // otherwise that autofocus can steal it between focus() and the assertion.
  await page.waitForFunction(
    () => {
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"],[role="alertdialog"]',
        ),
      ].filter(
        (node) =>
          !node.closest('[inert],[hidden],[aria-hidden="true"]') &&
          node.getClientRects().length > 0,
      );
      return dialogs.at(-1)?.contains(document.activeElement) ?? false;
    },
    undefined,
    { timeout: 5000 },
  );
  const accessible = await page
    .locator(".v-window-controls")
    .evaluate((controls) => {
      const buttons = [
        ...controls.querySelectorAll<HTMLButtonElement>("button"),
      ];
      return (
        buttons.length === 3 &&
        buttons.every((button) => {
          const r = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return (
            !!hit &&
            button.contains(hit) &&
            !button.closest("[inert], [aria-hidden=true]")
          );
        })
      );
    });
  if (!accessible)
    throw new Error("Calendar detail blocks native window controls");
  const control = page.locator(".v-window-controls button").first();
  await control.focus();
  await page.waitForFunction(
    () => {
      const control = document.querySelector(".v-window-controls button");
      return (
        !!control &&
        control === document.activeElement &&
        !control.closest('[inert],[aria-hidden="true"]')
      );
    },
    undefined,
    { timeout: 5000 },
  );
  await page.getByRole("dialog").focus();
}

// GPUI calendar/ui.rs:670 routes all three providers to Modal::Ics.
async function checkCalendarExportProviders(page: Page) {
  for (const label of ["Google", "Apple", "Outlook"]) {
    const button = page
      .locator(".v-calendar-rail")
      .getByRole("button", { name: label, exact: true });
    await button.click();
    const dialog = page.getByRole("dialog", {
      name: "Añadir a mi calendario",
      exact: true,
    });
    await dialog.waitFor();
    await page
      .getByText("Vista previa · 75 eventos esta semana", { exact: true })
      .waitFor();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(
      (name) => document.activeElement?.textContent?.endsWith(name),
      label,
    );
  }
}

async function assertCalendarMineControls(page: Page) {
  const chip = page
    .locator(".v-calendar-mine-slots button:not([data-alert])")
    .first();
  const visibleBorder = await chip.evaluate((node) => {
    const style = getComputedStyle(node);
    return (
      Number.parseFloat(style.borderTopWidth) >= 1 &&
      style.borderTopStyle === "solid" &&
      style.borderTopColor !== "rgba(0, 0, 0, 0)"
    );
  });
  if (!visibleBorder)
    throw new Error("Calendar mine time chip has no visible border");
  const clock = page.locator(".v-calendar-mine-launch-pending").first();
  if (
    !(await clock.isDisabled()) ||
    !(await clock.getAttribute("aria-describedby"))
  )
    throw new Error("Calendar scheduled launch lacks its disabled explanation");
  if (
    (await clock.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).opacity),
    )) !== 0.45
  )
    throw new Error(
      "Calendar scheduled launch differs from Upcoming disabled opacity",
    );
}

async function checkExpandedCalendarDay(page: Page) {
  const before = await page
    .locator(".v-calendar-day-scroll")
    .evaluate((node) => node.scrollTop);
  await page
    .getByRole("button", { name: "Pantalla completa", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Calendario", exact: true }).waitFor();
  await assertDetailWindowControls(page);
  const below = await page
    .locator(".v-calendar-day-full")
    .evaluate(
      (popup) =>
        popup.getBoundingClientRect().top >=
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--topbar-h",
          ),
        ),
    );
  if (!below) throw new Error("Expanded calendar day covers the topbar");
  await page
    .getByRole("button", {
      name: "Salir de pantalla completa (Esc)",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Pantalla completa",
  );
  const after = await page
    .locator(".v-calendar-day-scroll")
    .evaluate((node) => node.scrollTop);
  if (Math.abs(after - before) > 1)
    throw new Error("Expanded calendar day lost the inline hour");
}

async function checkExpandedCalendarMonth(page: Page) {
  await page
    .getByRole("button", { name: "Pantalla completa", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Calendario", exact: true }).waitFor();
  await assertDetailWindowControls(page);
  const below = await page
    .locator(".v-calendar-month-full")
    .evaluate(
      (popup) =>
        popup.getBoundingClientRect().top >=
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--topbar-h",
          ),
        ),
    );
  if (!below) throw new Error("Expanded calendar month covers the topbar");
  await page
    .getByRole("button", {
      name: "Salir de pantalla completa (Esc)",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Pantalla completa",
  );
}

async function checkExpandedCalendarWeek(page: Page) {
  await page
    .getByRole("button", { name: "Pantalla completa", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Calendario", exact: true }).waitFor();
  await assertDetailWindowControls(page);
  const belowTopbar = await page
    .locator(".v-calendar-week-full")
    .evaluate(
      (popup) =>
        popup.getBoundingClientRect().top >=
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--topbar-h",
          ),
        ),
    );
  if (!belowTopbar) throw new Error("Expanded calendar week covers the topbar");
  const weekStyle = await page
    .locator(".v-calendar-week-full")
    .evaluate((root) => {
      const line = root.querySelector(".v-calendar-week-live-now");
      const legend = root.querySelector(".v-calendar-week-legend-now");
      const band = root.querySelector(
        ".v-calendar-week-live-daily[data-favorite] > button",
      );
      if (!line || !legend || !band) return false;
      const now = getComputedStyle(line),
        outline = getComputedStyle(band);
      const red = outline.borderTopColor.match(/[\d.]+/g)?.map(Number) ?? [];
      return (
        now.width === "2px" &&
        now.backgroundColor === getComputedStyle(legend).backgroundColor &&
        outline.borderTopStyle === "solid" &&
        Number.parseFloat(outline.borderTopWidth) >= 1 &&
        red[0] > red[1] &&
        red[0] > red[2]
      );
    });
  if (!weekStyle)
    throw new Error(
      "Calendar week lost its red Now line or favorite band outline",
    );
  await page
    .getByRole("button", {
      name: "Salir de pantalla completa (Esc)",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Calendario", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Pantalla completa",
  );
}

export const calendarScenes: Record<string, VisualScene> = {
  "calendario-semana-ampliada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-semana-contraida"].prepare(page);
      await page
        .getByRole("button", { name: "Pantalla completa", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Calendario", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-ics-reemplazar": {
    mock: "calendar-ics-replace-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Añadir a mi calendario", exact: true })
        .click();
      await page
        .getByText("Vista previa · 75 eventos esta semana", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Descargar .ics", exact: true })
        .click();
      await page
        .getByRole("alertdialog", { name: "¿Reemplazar?", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
    async cleanup(page) {
      const question = page.getByRole("alertdialog", { name: "¿Reemplazar?" });
      await page.keyboard.press("Escape");
      await question.waitFor({ state: "hidden" });
      await page.waitForFunction(() =>
        document.activeElement?.textContent?.includes("Descargar .ics"),
      );
      await page.getByRole("button", { name: "Descargar .ics" }).click();
      await question.waitFor();
      await question
        .getByRole("button", { name: "Reemplazar", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Añadir a mi calendario" })
        .waitFor({ state: "hidden" });
      await page.getByText("Calendario guardado.", { exact: true }).waitFor();
      await assertDetailWindowControls(page);
    },
  },
  "calendario-ics-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-proximas-contraida"].prepare(page);
      await checkCalendarExportProviders(page);
      await page
        .getByRole("button", { name: "Añadir a mi calendario", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Añadir a mi calendario", exact: true })
        .waitFor();
      await page
        .getByText("Vista previa · 75 eventos esta semana", { exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-ics-desplegada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-proximas"].prepare(page);
      await checkCalendarExportProviders(page);
      await page
        .getByRole("button", { name: "Añadir a mi calendario", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Añadir a mi calendario", exact: true })
        .waitFor();
      await page
        .getByText("Vista previa · 75 eventos esta semana", { exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-r6-mias": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "false")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Mis carreras", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Tu semana", exact: true })
        .waitFor();
      await page.getByText("4 carreras", { exact: true }).waitFor();
      await assertCalendarMineControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-r6-semana": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "false")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page.getByRole("tab", { name: "Calendario", exact: true }).click();
      await page
        .getByRole("heading", { name: "Semana 6–12 oct", exact: true })
        .waitFor();
      await checkExpandedCalendarWeek(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-r6-proximas": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "false")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Lanzar «Carrera LMU»", exact: false })
        .waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-proximas-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Lanzar «Carrera LMU»", exact: false })
        .waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-semana-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page.getByRole("tab", { name: "Calendario", exact: true }).click();
      await page
        .getByRole("heading", { name: "Semana 6–12 oct", exact: true })
        .waitFor();
      await checkExpandedCalendarWeek(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-mias-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Mis carreras", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Tu semana", exact: true })
        .waitFor();
      await page.getByText("4 carreras", { exact: true }).waitFor();
      await assertCalendarMineControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-eventos-desplegada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-eventos-contraida"].prepare(page);
      await page
        .getByRole("button", {
          name: "Contraer o ampliar navegación",
          exact: true,
        })
        .click();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-eventos-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page.getByRole("tab", { name: /^Eventos(?: 2)?$/ }).click();
      await page
        .getByRole("article", { name: "WEC Weekly", exact: true })
        .waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-r6-dia": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-dia-contraida"].prepare(page);
      await page
        .getByRole("button", {
          name: "Contraer o ampliar navegación",
          exact: true,
        })
        .click();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-dia-ampliada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-dia-contraida"].prepare(page);
      await page
        .getByRole("button", { name: "Pantalla completa", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Calendario", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-dia-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page.getByRole("tab", { name: "Calendario", exact: true }).click();
      await page.getByRole("button", { name: "Día", exact: true }).click();
      await page.locator(".v-calendar-day-grid").waitFor();
      await checkExpandedCalendarDay(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-r6-mes": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-mes-contraida"].prepare(page);
      await page
        .getByRole("button", {
          name: "Contraer o ampliar navegación",
          exact: true,
        })
        .click();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-mes-ampliada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-mes-contraida"].prepare(page);
      await page
        .getByRole("button", { name: "Pantalla completa", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Calendario", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-mes-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page.getByRole("tab", { name: "Calendario", exact: true }).click();
      await page.getByRole("button", { name: "Mes", exact: true }).click();
      await page
        .getByRole("heading", { name: "Octubre 2026", exact: true })
        .waitFor();
      await checkExpandedCalendarMonth(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-serie-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .locator(".v-calendar-live-series")
        .filter({ hasText: "LMGT3 Fixed" })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await page.getByText("Imola", { exact: true }).waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-serie-desplegada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "false")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .locator(".v-calendar-live-series")
        .filter({ hasText: "LMGT3 Fixed" })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await page.getByText("Imola", { exact: true }).waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "calendario-ficha-desplegada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-proximas"].prepare(page);
      await page
        .getByRole("button", { name: "Ficha", exact: true })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-ficha-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ficha", exact: true })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "LMGT3 Fixed", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-avisos-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await sidebar.getAttribute("aria-expanded")) === "true")
        await sidebar.click();
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^Avisos/u })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "Avisos", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
  "calendario-avisos-desplegada": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-proximas"].prepare(page);
      await page
        .getByRole("button", { name: /^Avisos/u })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "Avisos", exact: true })
        .waitFor();
      await assertDetailWindowControls(page);
      await page.mouse.move(600, 890);
    },
  },
};
