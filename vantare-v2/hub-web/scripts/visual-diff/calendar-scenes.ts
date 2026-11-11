import type { VisualScene } from "./scenes.ts";
export const calendarScenes: Record<string, VisualScene> = {
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
  "calendario-ficha-contraida": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await page.clock.setFixedTime(new Date("2026-10-08T17:47:13Z"));
      const sidebar = page.getByRole("button", {name:"Contraer o ampliar navegación",exact:true});
      if ((await sidebar.getAttribute("aria-expanded")) === "true") await sidebar.click();
      await page.getByRole("navigation",{name:"Navegación principal"}).getByRole("button",{name:"Calendario",exact:true}).click();
      await page.getByRole("button",{name:"Ficha",exact:true}).first().click();
      await page.getByRole("dialog").getByRole("heading",{name:"LMGT3 Fixed",exact:true}).waitFor();
      await page.mouse.move(600,890);
    },
  },
};
