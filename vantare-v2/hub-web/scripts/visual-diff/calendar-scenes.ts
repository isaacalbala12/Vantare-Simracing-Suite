import type { VisualScene } from "./scenes.ts";
export const calendarScenes: Record<string, VisualScene> = {
  "calendario-r6-proximas": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
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
  "calendario-base": {
    mock: "calendar-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-09-30T17:00:00Z"));
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Calendario", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Calendario LMU", exact: true })
        .waitFor();
      await page.getByText("LMGT3 Fixed", { exact: true }).waitFor();
      await page.mouse.move(600, 890);
    },
  },
};
