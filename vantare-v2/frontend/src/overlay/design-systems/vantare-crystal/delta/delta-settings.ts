export const DELTA_TEMPLATE_IDS = ["delta-bar", "delta-simple"] as const;

export type DeltaTemplateId = (typeof DELTA_TEMPLATE_IDS)[number];
export type DeltaTemplateDiagnostic = "unknown-template";

export type DeltaSettings = {
  templateId: DeltaTemplateId;
  showHeader: boolean;
  templateDiagnostic?: DeltaTemplateDiagnostic;
};

function isDeltaTemplateId(value: unknown): value is DeltaTemplateId {
  return typeof value === "string" && (DELTA_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function parseDeltaSettings(input: unknown): DeltaSettings {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const showHeader = source.showHeader !== false;
  if (source.templateId === undefined) {
    return { templateId: "delta-bar", showHeader };
  }
  if (isDeltaTemplateId(source.templateId)) {
    return { templateId: source.templateId, showHeader };
  }
  return { templateId: "delta-bar", showHeader, templateDiagnostic: "unknown-template" };
}

export function migrateDeltaSettingsV1(settings: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseDeltaSettings(settings);
  return {
    ...settings,
    templateId: parsed.templateId,
  };
}

