import type { Locale } from "../../../i18n/i18n";
import type { DeltaReference } from "../../widget-types/delta/delta-content";

const labels: Record<Locale, { names: Record<DeltaReference, string>; unavailable: string; using: string }> = {
  en: { names: { "personal-best": "Personal best", "session-best": "Session best", "previous-lap": "Previous lap" }, unavailable: "unavailable", using: "using" },
  es: { names: { "personal-best": "Mejor personal", "session-best": "Mejor de sesión", "previous-lap": "Vuelta anterior" }, unavailable: "no disponible", using: "usando" },
  pt: { names: { "personal-best": "Melhor pessoal", "session-best": "Melhor da sessão", "previous-lap": "Volta anterior" }, unavailable: "indisponível", using: "usando" },
  it: { names: { "personal-best": "Miglior personale", "session-best": "Migliore della sessione", "previous-lap": "Giro precedente" }, unavailable: "non disponibile", using: "in uso" },
};

export function deltaReferenceNotice(locale: Locale, requested: DeltaReference | undefined, effective: DeltaReference | undefined): string | undefined {
  if (!requested || requested === effective) return undefined;
  const text = labels[locale];
  const unavailable = `${text.names[requested]}: ${text.unavailable}`;
  return effective ? `${unavailable} · ${text.using} ${text.names[effective]}` : unavailable;
}
