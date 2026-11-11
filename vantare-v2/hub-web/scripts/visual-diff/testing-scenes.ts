import type { VisualScene } from "./scenes.ts";

export const testingScenes: Record<string, VisualScene> = {
  "testing-center-diagnostico": {
    mock: "testing-tester-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Diagnóstico local", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Informe de diagnóstico", exact: true })
        .waitFor();
    },
  },
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
    },
  },
};
