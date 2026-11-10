import type { VisualScene } from "./scenes.ts";
export const notificationScenes: Record<string, VisualScene> = {
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
