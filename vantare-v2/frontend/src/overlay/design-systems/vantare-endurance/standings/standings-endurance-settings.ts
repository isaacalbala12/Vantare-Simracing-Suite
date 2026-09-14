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

/**
 * Opt-in Redline tower lab (ISA-1071). All tower keys default to the historic
 * Redline look so saved profiles render exactly as before unless the user
 * opts in explicitly. Tower consumes optional manufacturer presentation
 * identity; it never infers it from a driver. The visual reference fixture
 * supplies that identity only in development, not in live V2 telemetry.
 */
export const REDLINE_TOWER_THEMES = ["classic", "tower"] as const;
export type RedlineTowerTheme = (typeof REDLINE_TOWER_THEMES)[number];
export const REDLINE_TOWER_SELECTIONS = ["legacy", "glow", "frame", "plate"] as const;
export type RedlineTowerSelection = (typeof REDLINE_TOWER_SELECTIONS)[number];
export const REDLINE_TOWER_HEADERS = ["current", "signature", "session", "compact"] as const;
export type RedlineTowerHeader = (typeof REDLINE_TOWER_HEADERS)[number];

export type StandingsEnduranceSettings = {
  templateId: StandingsEnduranceTemplateId;
  showSessionHeader: boolean;
  redlineTheme: RedlineTowerTheme;
  redlineSelection: RedlineTowerSelection;
  redlineHeader: RedlineTowerHeader;
  /** Background-surface alpha only; never the whole content. 1 = historic. */
  redlineSurfaceOpacity: number;
  templateDiagnostic?: StandingsEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is StandingsEnduranceTemplateId {
  return (
    typeof value === "string" &&
    (STANDINGS_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

function isRedlineTowerTheme(value: unknown): value is RedlineTowerTheme {
  return typeof value === "string" && (REDLINE_TOWER_THEMES as readonly string[]).includes(value);
}

function isRedlineTowerSelection(value: unknown): value is RedlineTowerSelection {
  return typeof value === "string" && (REDLINE_TOWER_SELECTIONS as readonly string[]).includes(value);
}

function isRedlineTowerHeader(value: unknown): value is RedlineTowerHeader {
  return typeof value === "string" && (REDLINE_TOWER_HEADERS as readonly string[]).includes(value);
}

function readRedlineSurfaceOpacity(value: unknown): number {
  // ponytail: clamp, callers pass raw query input.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0.45, value));
}

export function parseStandingsEnduranceSettings(input: unknown): StandingsEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const showSessionHeader = source.showSessionHeader !== false;
  const redlineTheme = isRedlineTowerTheme(source.redlineTheme) ? source.redlineTheme : "classic";
  const redlineSelection = isRedlineTowerSelection(source.redlineSelection)
    ? source.redlineSelection
    : "legacy";
  const redlineHeader = isRedlineTowerHeader(source.redlineHeader) ? source.redlineHeader : "current";
  const redlineSurfaceOpacity = readRedlineSurfaceOpacity(source.redlineSurfaceOpacity);
  if (source.templateId === undefined) {
    return { templateId: "standings-redline", showSessionHeader, redlineTheme, redlineSelection, redlineHeader, redlineSurfaceOpacity };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId, showSessionHeader, redlineTheme, redlineSelection, redlineHeader, redlineSurfaceOpacity };
  }
  return {
    templateId: "standings-redline",
    showSessionHeader,
    redlineTheme,
    redlineSelection,
    redlineHeader,
    redlineSurfaceOpacity,
    templateDiagnostic: "unknown-template",
  };
}

export const STANDINGS_ENDURANCE_DEFAULT_SETTINGS = {
  ...STANDINGS_DEFAULT_APPEARANCE,
  templateId: "standings-redline" as StandingsEnduranceTemplateId,
  showSessionHeader: true,
  redlineTheme: "classic" as RedlineTowerTheme,
  redlineSelection: "legacy" as RedlineTowerSelection,
  redlineHeader: "current" as RedlineTowerHeader,
  redlineSurfaceOpacity: 1,
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
    redlineTheme: parsed.redlineTheme,
    redlineSelection: parsed.redlineSelection,
    redlineHeader: parsed.redlineHeader,
    redlineSurfaceOpacity: parsed.redlineSurfaceOpacity,
  };
}
