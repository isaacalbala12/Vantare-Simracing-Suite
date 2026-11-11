import type { VisualScene } from "./scenes.ts";
export const calendarScenes: Record<string, VisualScene> = {
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
};
