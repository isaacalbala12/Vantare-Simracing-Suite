import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";
import {
  assertQuestionnaireUsesFreeHeight,
  assertTestingConsentFits,
  settingsTabsStyle,
} from "./testing-readability.ts";
import {
  assertConsentPaintChange,
  assertReportConsent,
} from "./testing-report-consent.ts";

export const testingScenes: Record<string, VisualScene> = {
  "testing-center-comunidad": {
    mock: "testing-tester-community-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.getByRole("tab", { name: "Comunidad", exact: true }).click();
      await page.getByRole("button", { name: "Recargar", exact: true }).click();
      await page
        .getByText("Datos confirmados por el servicio", {
          exact: true,
        })
        .waitFor();
      await page
        .getByText("QA · documentación de una prueba · En revisión", {
          exact: true,
        })
        .waitFor();
      await page.mouse.move(600, 890);
    },
  },
  "testing-center-triage": {
    mock: "testing-tester-reference",
    async prepare(page) {
      const settings = page.getByRole("button", {
        name: "Ajustes",
        exact: true,
      });
      await settings.click();
      const before = await settingsTabsStyle(page);
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.getByRole("tab", { name: "Informes", exact: true }).click();
      await page
        .getByRole("heading", { name: "Informe para revisión", exact: true })
        .waitFor();
      await assertTestingConsentFits(page, true);
      await settings.click();
      const after = await settingsTabsStyle(page);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Testing styles changed Settings tabs");
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.getByRole("tab", { name: "Informes", exact: true }).click();
      await page
        .getByRole("heading", { name: "Informe para revisión", exact: true })
        .waitFor();
      await assertTestingConsentFits(page, true);
      await page.mouse.move(600, 850);
    },
  },
  "testing-center-cuestionarios": {
    mock: "testing-tester-questionnaires-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Cuestionarios", exact: true })
        .click();
      await page.getByRole("button", { name: "Recargar", exact: true }).click();
      await page
        .getByText("Datos confirmados por el servicio", {
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", {
          name: "0.0.974 · QA · experiencia del Hub · Sin responder",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Guardar respuesta", exact: true })
        .waitFor();
      await assertQuestionnaireUsesFreeHeight(page);
      await page.mouse.move(600, 890);
    },
  },
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
      await page.getByRole("tab", { name: "Informes", exact: true }).click();
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
    mock: "testing-tester-report-reference",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Testing Center", exact: true })
        .click();
      await page.getByRole("tab", { name: "Informes", exact: true }).click();
      await page
        .getByRole("button", { name: "Informe con capturas", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Nuevo informe", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Cargar borrador", exact: true })
        .and(page.locator(":enabled"))
        .waitFor();
      await page.getByText("Capturas · 0/3", { exact: true }).waitFor();
      await page.mouse.move(600, 890);
    },
  },
};

// Both captured states exercise the real controls and the service-shaped mock projection.
async function prepareReportPreview(page: Page, accepted: boolean) {
  await testingScenes["testing-center-informe"].prepare(page);
  await page
    .getByRole("textbox", { name: "Título · qué hiciste", exact: true })
    .fill("Abrir Testing Center");
  await page
    .getByRole("textbox", {
      name: "Texto · qué ocurrió o qué propones",
      exact: true,
    })
    .fill("El panel se quedó vacío");
  await page
    .getByRole("textbox", { name: "Qué esperabas", exact: true })
    .fill("Ver el panel completo");
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .and(page.locator(":enabled"))
    .click();
  await page
    .getByRole("button", { name: "Previsualizar envío", exact: true })
    .and(page.locator(":enabled"))
    .click();
  const preview = page.getByRole("region", {
    name: "Revisa el contenido antes de enviar",
    exact: true,
  });
  await preview.getByText("Informe estructurado", { exact: true }).waitFor();
  const content = (await preview.textContent()) ?? "";
  if (
    content.includes("Abrir Testing Center") ||
    content.includes("El panel se quedó vacío")
  )
    throw new Error(
      "Private draft notes leaked into the simulated submission preview",
    );
  const unchecked = await assertReportConsent(page, false);
  const checkbox = page.getByRole("checkbox", {
    name: "He revisado y acepto enviar este contenido al equipo de Vantare",
    exact: true,
  });
  await checkbox.check();
  const checked = await assertReportConsent(page, true);
  assertConsentPaintChange(unchecked, checked);
  if (!accepted) {
    await checkbox.uncheck();
    await assertReportConsent(page, false);
  }
  await page.mouse.move(600, 890);
}
testingScenes["testing-center-informe-preview"] = {
  mock: "testing-tester-report-reference",
  prepare: (page) => prepareReportPreview(page, true),
};
testingScenes["testing-center-informe-preview-sin-consentir"] = {
  mock: "testing-tester-report-reference",
  prepare: (page) => prepareReportPreview(page, false),
};
