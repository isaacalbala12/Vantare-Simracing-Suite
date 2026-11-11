import { calendarScenes } from "./calendar-scenes.ts";
import type { VisualScene } from "./scenes.ts";
export const sweepScenes: Record<string, VisualScene> = {
  "notificaciones-completa": {
    mock: "notificaciones-base",
    async prepare(page) {
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Ver todas las notificaciones",
          exact: true,
        })
        .click();
      await page.locator(".v-notifications--full").waitFor();
    },
  },
  "testing-center-informe": {
    mock: "testing-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Ayúdanos a mejorar Vantare",
          exact: true,
        })
        .waitFor();
    },
  },
  "calendario-mes": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-semana"].prepare(page);
      await page.getByRole("button", { name: "Mes", exact: true }).click();
      await page.locator(".v-calendar-month").waitFor();
    },
  },
};
