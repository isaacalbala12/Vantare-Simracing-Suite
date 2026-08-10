import { PEDALS_DEFAULT_APPEARANCE } from "../../../widget-types/pedals/pedals-renderer-helpers";

export const PEDALS_ENDURANCE_TEMPLATE_IDS = [
  "pedals-classic",
  "pedals-neo",
  "pedals-redline",
] as const;

export type PedalsEnduranceTemplateId = (typeof PEDALS_ENDURANCE_TEMPLATE_IDS)[number];
export type PedalsEnduranceTemplateDiagnostic = "unknown-template";

export type PedalsEnduranceSettings = {
  templateId: PedalsEnduranceTemplateId;
  templateDiagnostic?: PedalsEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is PedalsEnduranceTemplateId {
  return (
    typeof value === "string" && (PEDALS_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function parsePedalsEnduranceSettings(input: unknown): PedalsEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  if (source.templateId === undefined) {
    return { templateId: "pedals-redline" };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId };
  }
  return { templateId: "pedals-redline", templateDiagnostic: "unknown-template" };
}

export const PEDALS_ENDURANCE_DEFAULT_SETTINGS = {
  ...PEDALS_DEFAULT_APPEARANCE,
  templateId: "pedals-redline" as PedalsEnduranceTemplateId,
};

export function normalizePedalsEnduranceSettings(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = parsePedalsEnduranceSettings(source);
  return {
    ...PEDALS_ENDURANCE_DEFAULT_SETTINGS,
    ...source,
    templateId: parsed.templateId,
  };
}
