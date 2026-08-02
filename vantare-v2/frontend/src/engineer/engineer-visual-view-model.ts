import type {
  EngineerLocale,
  EngineerPresentation,
  EngineerRole,
  EngineerSeverity,
} from "./engineer-presentation-store";

export type EngineerVisualViewModel = {
  messageId: string;
  speaker: string;
  category?: string;
  text: string;
  severity: EngineerSeverity;
  role: EngineerRole;
  locale: EngineerLocale;
};

function speakerFor(role: EngineerRole, locale: EngineerLocale): string {
  if (role === "spotter") return "Spotter";
  return { es: "Ingeniero", en: "Engineer", it: "Ingegnere", "pt-BR": "Engenheiro" }[locale];
}

export function buildEngineerVisualViewModel(presentation: EngineerPresentation): EngineerVisualViewModel {
  return {
    messageId: presentation.id,
    speaker: speakerFor(presentation.role, presentation.locale),
    category: presentation.category === presentation.role
      ? undefined
      : presentation.category.toLocaleUpperCase(presentation.locale),
    text: presentation.text,
    severity: presentation.severity,
    role: presentation.role,
    locale: presentation.locale,
  };
}
