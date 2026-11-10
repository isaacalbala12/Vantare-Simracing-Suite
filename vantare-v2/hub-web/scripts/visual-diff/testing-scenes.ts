import type { VisualScene } from "./scenes.ts";

export const testingScenes: Record<string, VisualScene> = {
  "testing-center-informe": {
    mock: "testing-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Informes", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Ayúdanos a mejorar Vantare",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Contraer o ampliar navegación",
          exact: true,
        })
        .click();
    },
  },
};
