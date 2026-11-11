import type { VisualScene } from "./scenes.ts";

export const testingScenes: Record<string, VisualScene> = {
  "testing-center-resumen": {
    mock: "testing-tester-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Tu experiencia cuenta", exact: true })
        .waitFor();
      await page.mouse.move(600, 850);
    },
  },
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
      // Exercise SHA-256 in real Electron, then restore the reference's empty view.
      await page
        .getByRole("button", { name: "Preparar diagnóstico", exact: true })
        .click();
      await page
        .getByText(
          "Diagnóstico preparado en memoria. Revisa antes de exportar.",
          { exact: true },
        )
        .waitFor();
      if (
        !(await page
          .getByRole("button", { name: "Exportar JSON local", exact: true })
          .isEnabled())
      )
        throw new Error("Reviewed digest was not enabled");
      await page
        .getByRole("button", { name: "Diagnóstico local", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Diagnóstico local", exact: true })
        .click();
      await page
        .getByText(
          "Prepara el diagnóstico para ver la lista blanca de datos exportables.",
          { exact: true },
        )
        .waitFor();
      await page.mouse.move(600, 850);
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
