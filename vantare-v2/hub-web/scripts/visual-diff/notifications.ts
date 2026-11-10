import type { VisualScene } from "./scenes.ts";
export const notificationScenes: Record<string, VisualScene> = {
  "notificaciones-completa-vacio": {
    mock: "notificaciones-base",
    async prepare(page) {
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
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
      const full = page.locator(".v-notifications--full");
      await full.getByRole("button", { name: "Limpiar", exact: true }).click();
      await full.getByText("Todo al día", { exact: true }).waitFor();
      const toast = page.locator(".v-toast");
      if (await toast.isVisible()) {
        await toast
          .getByRole("button", { name: "Cerrar", exact: true })
          .click();
        await toast.waitFor({ state: "hidden" });
      }
    },
  },
  "shell-notificaciones-abiertas": {
    mock: "notificaciones-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Inicio", exact: true }).click();
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page.getByText("Todo al día", { exact: true }).waitFor();
    },
  },
};
