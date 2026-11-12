import type { Page } from "playwright-core";
import { PNG } from "pngjs";
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
async function masterWindows(page: Page, enabled: boolean) {
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("button", { name: "Ajustes", exact: true })
    .click();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  const control = page.getByRole("switch", {
    name: "Notificaciones de Windows",
    exact: true,
  });
  await control.waitFor();
  if (((await control.getAttribute("aria-checked")) === "true") !== enabled)
    await control.click();
  await page.waitForFunction(
    ({ node, enabled }) =>
      node?.getAttribute("aria-checked") === String(enabled) &&
      node?.getAttribute("aria-disabled") !== "true",
    { node: await control.elementHandle(), enabled },
  );
}
function alerts(expanded: boolean, enabled = true): VisualScene {
  return {
    mock: "calendar-live-reference",
    async prepare(page) {
      await masterWindows(page, enabled);
      await calendarScenes[
        expanded
          ? "calendario-avisos-desplegada"
          : "calendario-avisos-contraida"
      ].prepare(page);
      const preview = page.locator(".v-calendar-alerts-toast");
      await preview
        .getByText("Vantare · Calendario", { exact: true })
        .waitFor();
      // Force compositor readback and reject a preview without painted text.
      const pixels = PNG.sync.read(await preview.screenshot());
      let ink = 0;
      for (let i = 0; i < pixels.data.length; i += 4)
        if (
          pixels.data[i] > 180 &&
          pixels.data[i + 1] > 180 &&
          pixels.data[i + 2] > 180
        )
          ink++;
      if (ink < 50) throw Error("Calendar preview text was not painted");
      if (!enabled)
        await page
          .getByText(
            "Las notificaciones de Windows están desactivadas en Ajustes › General",
            { exact: true },
          )
          .first()
          .waitFor();
      for (const name of ["Notificación de Windows", "Sonido"]) {
        const control = page.getByRole("checkbox", { name, exact: true });
        if (
          ((await control.getAttribute("aria-disabled")) === "true") !==
          !enabled
        )
          throw Error(`General-off Calendar delivery still enabled: ${name}`);
      }
    },
  };
}
function week(expanded: boolean, enabled = true): VisualScene {
  return {
    mock: "calendar-live-reference",
    async prepare(page) {
      await masterWindows(page, enabled);
      await sidebar(page, expanded);
      if (!enabled) {
        await page.clock.setFixedTime(new Date("2026-10-14T17:47:13Z"));
        await page
          .getByRole("navigation", { name: "Navegación principal" })
          .getByRole("button", { name: "Calendario", exact: true })
          .click();
        const control = page.getByRole("switch", {
          name: "Avisarme al llegar",
          exact: true,
        });
        await control.waitFor();
        if ((await control.getAttribute("aria-disabled")) !== "true")
          throw Error("General-off week notice is enabled");
        await page
          .getByText(
            "Las notificaciones de Windows están desactivadas en Ajustes › General",
            { exact: true },
          )
          .waitFor();
        return;
      }
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
  "calendario-general-semana-contraida": week(false, false),
  "calendario-general-avisos-contraida": alerts(false, false),
  "calendario-general-avisos-desplegada": alerts(true, false),
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
