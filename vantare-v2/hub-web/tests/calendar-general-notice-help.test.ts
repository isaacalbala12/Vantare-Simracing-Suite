import { expect, it } from "vitest";
import { t } from "../src/renderer/i18n/es";

it("directs automatic Calendar notifications to their independent preferences", () => {
  const help = t("general.toastsHelp");
  expect(help).toContain("Enviar prueba");
  expect(help).toContain("Calendario › Avisos");
  expect(help).toContain("no dependen de este ajuste");
  expect(help).not.toContain("automáticos aún no están disponibles");
});
