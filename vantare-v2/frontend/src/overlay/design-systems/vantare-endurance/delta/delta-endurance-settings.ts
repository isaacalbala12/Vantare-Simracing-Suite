export const DELTA_ENDURANCE_TEMPLATE_IDS = [
  "delta-strip",
  "delta-block",
  "delta-neo",
  "delta-redline",
] as const;

export type DeltaEnduranceTemplateId = (typeof DELTA_ENDURANCE_TEMPLATE_IDS)[number];
export type DeltaEnduranceTemplateDiagnostic = "unknown-template";

export type DeltaEnduranceSettings = {
  templateId: DeltaEnduranceTemplateId;
  showHeader: boolean;
  lossColor: string;
  templateDiagnostic?: DeltaEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is DeltaEnduranceTemplateId {
  return (
    typeof value === "string" && (DELTA_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function parseDeltaEnduranceSettings(input: unknown): DeltaEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const lossColor = typeof source.lossColor === "string" && /^#[0-9a-f]{6}$/i.test(source.lossColor) ? source.lossColor : "#ff6b76";
  const showHeader = source.showHeader !== false;
  if (source.templateId === undefined) {
    return { templateId: "delta-redline", showHeader, lossColor };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId, showHeader, lossColor };
  }
  return { templateId: "delta-redline", showHeader, lossColor, templateDiagnostic: "unknown-template" };
}

export const DELTA_ENDURANCE_DEFAULT_SETTINGS = {
  templateId: "delta-redline" as DeltaEnduranceTemplateId,
  showHeader: true,
  lossColor: "#ff6b76",
};

export function normalizeDeltaEnduranceSettings(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = parseDeltaEnduranceSettings(source);
  return {
    ...DELTA_ENDURANCE_DEFAULT_SETTINGS,
    ...source,
    templateId: parsed.templateId,
    showHeader: parsed.showHeader,
    lossColor: parsed.lossColor,
  };
}
