import { expect, it } from "vitest";
import { calendarAlertsText } from "../src/renderer/i18n/calendarAlerts";
import { t } from "../src/renderer/i18n/es";

it("directs Calendar notification preferences to their screen", () => {
  const help = t("general.toastsHelp");
  expect(help).toContain("Enviar prueba");
  expect(help).toContain(
    "todas las notificaciones de Windows del Hub, incluido el Calendario",
  );
  expect(help).toContain("Calendario › Avisos");
  expect(help).not.toContain("automáticos aún no están disponibles");
  expect(help).not.toContain("no dependen");
});

it("distinguishes the General requirement from the optional Calendar channel in the test help", () => {
  expect(calendarAlertsText.testHint).toContain(
    "activado en Ajustes › General",
  );
  expect(calendarAlertsText.testHint).toContain("canal del Calendario");
  expect(calendarAlertsText.testHint).not.toContain("canal Windows apagado");
});
