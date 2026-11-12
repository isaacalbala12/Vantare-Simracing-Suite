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
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes[
        expanded
          ? "calendario-avisos-desplegada"
          : "calendario-avisos-contraida"
      ].prepare(page);
      const preview = page.locator(".v-calendar-alerts-toast");
      await preview
        .getByText("Vantare · Calendario", { exact: true })
        .waitFor();
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
    mock: "calendar-live-reference",
    async prepare(page) {
      await sidebar(page, expanded);
      await notificationHonestyScenes["calendario-semana-pendiente"].prepare(
        page,
      );
    },
  };
}
function weeklyDetail(expanded: boolean): VisualScene {
  return {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes[
        expanded ? "calendario-ficha-desplegada" : "calendario-ficha-contraida"
      ].prepare(page);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cerrar (Esc)", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      await page
        .locator(".v-calendar-live-row")
        .filter({ hasText: "WEC Weekly" })
        .getByRole("button", { name: "20:00", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "WEC Weekly", exact: true })
        .waitFor();
      await page.getByText(/Windows: 10 min antes/u).waitFor();
      const accessible = await page
        .locator(".v-window-controls")
        .evaluate((controls) =>
          Array.from(controls.querySelectorAll("button")).every((button) => {
            const r = button.getBoundingClientRect();
            return button.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        );
      if (!accessible) throw Error("Weekly detail covers window controls");
      await page.mouse.move(600, 890);
    },
  };
}
export const calendarNoticeScenes: Record<string, VisualScene> = {
  "calendario-emisor-ficha-semanal-contraida": weeklyDetail(false),
  "calendario-emisor-ficha-semanal-desplegada": weeklyDetail(true),
  "calendario-emisor-avisos-contraida": alerts(false),
  "calendario-emisor-avisos-desplegada": alerts(true),
  "calendario-emisor-semana-contraida": week(false),
  "calendario-emisor-semana-desplegada": week(true),
  "calendario-emisor-ficha-contraida": {
    mock: "calendar-live-reference",
    prepare: (page) =>
      calendarScenes["calendario-ficha-contraida"].prepare(page),
  },
  "calendario-emisor-ficha-desplegada": {
    mock: "calendar-live-reference",
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
        .getByText("Aviso de prueba solicitado.", { exact: true })
        .waitFor();
    },
  },
};
