import { RELATIVE_DEFAULT_APPEARANCE } from "../../../widget-types/relative/relative-renderer-helpers";

export const RELATIVE_ENDURANCE_TEMPLATE_IDS = [
  "relative-classic",
  "relative-minimal",
  "relative-neo",
  "relative-redline-mirror",
  "relative-redline-proximity",
  "relative-redline-traffic",
] as const;

export type RelativeEnduranceTemplateId = (typeof RELATIVE_ENDURANCE_TEMPLATE_IDS)[number];
export type RelativeEnduranceTemplateDiagnostic = "unknown-template";

export type RelativeEnduranceSettings = {
  templateId: RelativeEnduranceTemplateId;
  showHeader: boolean;
  templateDiagnostic?: RelativeEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is RelativeEnduranceTemplateId {
  return (
    typeof value === "string" &&
    (RELATIVE_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function parseRelativeEnduranceSettings(input: unknown): RelativeEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const showHeader = source.showHeader !== false;
  if (source.templateId === undefined) {
    return { templateId: "relative-classic", showHeader };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId, showHeader };
  }
  return { templateId: "relative-classic", showHeader, templateDiagnostic: "unknown-template" };
}

export const RELATIVE_ENDURANCE_DEFAULT_SETTINGS = {
  ...RELATIVE_DEFAULT_APPEARANCE,
  templateId: "relative-classic" as RelativeEnduranceTemplateId,
  showHeader: true,
};

export function normalizeRelativeEnduranceSettings(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = parseRelativeEnduranceSettings(source);
  return {
    ...RELATIVE_ENDURANCE_DEFAULT_SETTINGS,
    ...source,
    templateId: parsed.templateId,
    showHeader: parsed.showHeader,
  };
}
