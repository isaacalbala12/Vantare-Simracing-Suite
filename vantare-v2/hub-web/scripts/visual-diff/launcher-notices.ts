import { launcherText } from "../../src/renderer/i18n/launcher.ts";
import type { VisualScene } from "./scenes.ts";

export const launcherNoticeScenes: Record<string, VisualScene> = {
  "launcher-notice-completed": {
    mock: "launcher-notice-completed",
    async prepare(page) {
      await page.getByRole("button", { name: /^Launcher ?\d*$/ }).click();
      await page
        .getByRole("heading", { name: "Creador de Contenido", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: new RegExp(`^${launcherText.launch}`) })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page.getByText("Aplicaciones listas", { exact: true }).waitFor();
      await page
        .getByRole("button", {
          name: "Ver todas las notificaciones",
          exact: true,
        })
        .click();
      await page.locator(".v-notifications--full").waitFor();
      await page.getByText("Aplicaciones listas", { exact: true }).waitFor();
    },
  },
};
