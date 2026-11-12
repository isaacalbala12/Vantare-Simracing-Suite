import type { VisualScene } from "./scenes.ts";
export const notificationHonestyScenes: Record<string, VisualScene> = {
  // Override the standard General scene with enabled-preference assertions.
  "ajustes-aplicacion": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Ajustes", exact: true })
        .click();
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page
        .getByRole("heading", { name: "General", exact: true })
        .waitFor();
      for (const label of ["Avisos de actualización", "Avisos del Launcher"]) {
        const control = page.getByRole("switch", { name: label, exact: true });
        if (
          !(await control.isEnabled()) ||
          !(await control.getAttribute("aria-description"))
        )
          throw new Error(
            `Internal notification preference unavailable or unexplained: ${label}`,
          );
      }
    },
  },
  "calendario-semana-pendiente": {
    mock: "calendar-live-reference",
    async prepare(page) {
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
      if (
        (await control.getAttribute("aria-disabled")) === "true" ||
        !(await control.getAttribute("aria-describedby"))
      )
        throw new Error(
          "Next-week notification lacks its active state or delivery explanation",
        );
    },
  },
};
