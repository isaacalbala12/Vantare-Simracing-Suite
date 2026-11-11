import { calendarScenes } from "./calendar-scenes.ts";
import type { VisualScene } from "./scenes.ts";
export const sweepScenes: Record<string, VisualScene> = {
  "strategy-proximamente": {
    mock: "proximamente-base",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Strategy", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Plan de paradas", exact: true })
        .waitFor();
    },
  },
  "engineer-base": {
    mock: "proximamente-base",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Engineer", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Avisos de voz en pista", exact: true })
        .waitFor();
    },
  },
  "notificaciones-completa": {
    mock: "notificaciones-base",
    async prepare(page) {
      const toasts = page.getByRole("switch", {
        name: "Notificaciones de Windows",
        exact: true,
      });
      if ((await toasts.getAttribute("aria-checked")) !== "true")
        await toasts.click();
      await page
        .getByRole("button", { name: "Enviar prueba", exact: true })
        .click();
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
  "calendario-mes": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-semana"].prepare(page);
      throw new Error(
        "Vista mensual no integrada: CalendarWeekView recibe onSpan undefined y Mes está deshabilitado",
      );
    },
  },
};
