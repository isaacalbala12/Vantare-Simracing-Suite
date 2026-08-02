import type { EngineerLocale, EngineerPresentation, EngineerSeverity } from "./engineer-presentation-store";

const TEXT: Record<EngineerLocale, Record<EngineerSeverity, string>> = {
  es: { info: "Diferencias actualizadas", warning: "Combustible crítico, entra en boxes", critical: "Coche a la izquierda" },
  en: { info: "Gaps updated", warning: "Fuel critical, pit now", critical: "Car left" },
  it: { info: "Distacchi aggiornati", warning: "Carburante critico, rientra ai box", critical: "Auto a sinistra" },
  "pt-BR": { info: "Diferenças atualizadas", warning: "Combustível crítico, entre nos boxes", critical: "Carro à esquerda" },
};

export function buildEngineerPresentationFixture(
  locale: EngineerLocale = "es",
  severity: EngineerSeverity = "critical",
): EngineerPresentation {
  const spotter = severity === "critical";
  const text = TEXT[locale][severity];
  return {
    version: 1,
    id: `harness-${locale}-${severity}`,
    category: spotter ? "spotter" : severity === "warning" ? "fuel" : "timings",
    severity,
    textKey: spotter ? "spotter.car_left" : severity === "warning" ? "fuel.pit_now" : "timing.gap_report",
    text,
    voiceText: text,
    locale,
    role: spotter ? "spotter" : "engineer",
    channel: spotter ? "spotter" : "engineer",
    priority: spotter ? 100 : severity === "warning" ? 80 : 20,
    createdAt: 1_000,
    expiresAt: 10_000,
    source: "telemetry-core",
  };
}
