import type { Page } from "playwright-core";
import { calendarScenes } from "./calendar-scenes.ts";
import { notificationHonestyScenes } from "./notification-honesty.ts";
import type { VisualScene } from "./scenes.ts";

async function sidebar(page: Page, expanded: boolean) {
  const control = page.getByRole("button", {
    name: "Contraer o ampliar navegación",
    exact: true,
  });
  if (((await control.getAttribute("aria-expanded")) === "true") !== expanded)
    await control.click();
}
function alerts(expanded: boolean): VisualScene {
  return {
    mock: "calendar-notice-reference",
    async prepare(page) {
      await calendarScenes[
        expanded
          ? "calendario-avisos-desplegada"
          : "calendario-avisos-contraida"
      ].prepare(page);
      for (const name of ["Notificación de Windows", "Sonido"]) {
        const control = page.getByRole("checkbox", { name, exact: true });
        if ((await control.getAttribute("aria-disabled")) === "true")
          throw Error(`Calendar delivery still disabled: ${name}`);
      }
    },
  };
}
function week(expanded: boolean): VisualScene {
  return {
    mock: "calendar-notice-reference",
    async prepare(page) {
      await sidebar(page, expanded);
      await notificationHonestyScenes["calendario-semana-pendiente"].prepare(
        page,
      );
    },
  };
}
export const calendarNoticeScenes: Record<string, VisualScene> = {
  "calendario-emisor-avisos-contraida": alerts(false),
  "calendario-emisor-avisos-desplegada": alerts(true),
  "calendario-emisor-semana-contraida": week(false),
  "calendario-emisor-semana-desplegada": week(true),
  "calendario-emisor-ficha-contraida": {
    mock: "calendar-notice-reference",
    prepare: (page) =>
      calendarScenes["calendario-ficha-contraida"].prepare(page),
  },
  "calendario-emisor-ficha-desplegada": {
    mock: "calendar-notice-reference",
    prepare: (page) =>
      calendarScenes["calendario-ficha-desplegada"].prepare(page),
  },
  "calendario-emisor-prueba": {
    mock: "calendar-notice-reference",
    async prepare(page) {
      await alerts(false).prepare(page);
      await page
        .getByRole("button", { name: "Probar aviso", exact: true })
        .click();
      await page
        .getByText(
          "Prueba solicitada a Windows. Su configuración decide si se muestra o suena.",
          { exact: true },
        )
        .waitFor();
    },
  },
};
