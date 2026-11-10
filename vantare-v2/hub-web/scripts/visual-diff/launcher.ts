import type { VisualScene } from "./scenes.ts";
export const launcherScenes: Record<string, VisualScene> = {
  "launcher-base": {
    mock: "launcher-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page
        .getByRole("heading", { name: "Creador de Contenido", exact: true })
        .waitFor();
      const toggle = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
    },
  },
};
