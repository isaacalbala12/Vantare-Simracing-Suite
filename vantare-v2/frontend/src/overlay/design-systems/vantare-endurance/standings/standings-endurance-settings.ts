import { STANDINGS_DEFAULT_APPEARANCE } from "../../../widget-types/standings/standings-renderer-helpers";

export const STANDINGS_ENDURANCE_TEMPLATE_IDS = [
  "standings-tower",
  "standings-strip",
  "standings-f1",
  "standings-wec",
  "standings-lmu",
  "standings-racelabs",
  "standings-apex",
  "standings-neo",
  "standings-redline",
] as const;

export type StandingsEnduranceTemplateId = (typeof STANDINGS_ENDURANCE_TEMPLATE_IDS)[number];
export type StandingsEnduranceTemplateDiagnostic = "unknown-template";

export type StandingsEnduranceSettings = {
  templateId: StandingsEnduranceTemplateId;
  showSessionHeader: boolean;
  templateDiagnostic?: StandingsEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is StandingsEnduranceTemplateId {
  return (
    typeof value === "string" &&
    (STANDINGS_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function parseStandingsEnduranceSettings(input: unknown): StandingsEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const showSessionHeader = source.showSessionHeader !== false;
  if (source.templateId === undefined) {
    return { templateId: "standings-tower", showSessionHeader };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId, showSessionHeader };
  }
  return {
    templateId: "standings-tower",
    showSessionHeader,
    templateDiagnostic: "unknown-template",
  };
}

export const STANDINGS_ENDURANCE_DEFAULT_SETTINGS = {
  ...STANDINGS_DEFAULT_APPEARANCE,
  templateId: "standings-tower" as StandingsEnduranceTemplateId,
  showSessionHeader: true,
};

export function normalizeStandingsEnduranceSettings(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = parseStandingsEnduranceSettings(source);
  return {
    ...STANDINGS_ENDURANCE_DEFAULT_SETTINGS,
    ...source,
    templateId: parsed.templateId,
    showSessionHeader: parsed.showSessionHeader,
  };
}
