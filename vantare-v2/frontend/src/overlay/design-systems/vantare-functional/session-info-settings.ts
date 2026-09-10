import type { StandingsInfoMetric } from "../../widget-types/standings/standings-view-model";

export const FUNCTIONAL_INFO_METRICS = ["none", "trackTemperature", "airTemperature", "estimatedLaps", "totalLaps", "track", "remaining", "rain", "wetness"] as const;
export type FunctionalInfoChoice = StandingsInfoMetric | "none";

export const FUNCTIONAL_DEFAULT_SETTINGS = {
  showSessionHeader: true,
  templateId: "signature",
  headerFirst: "trackTemperature",
  headerSecond: "airTemperature",
  showSessionFooter: true,
  footerFirst: "track",
  footerSecond: "estimatedLaps",
} as const;

function infoChoice(value: unknown, fallback: FunctionalInfoChoice): FunctionalInfoChoice {
  return FUNCTIONAL_INFO_METRICS.includes(value as FunctionalInfoChoice) ? value as FunctionalInfoChoice : fallback;
}

export function parseFunctionalSettings(input: unknown) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return {
    showSessionHeader: value.showSessionHeader !== false,
    templateId: value.templateId === "broadcast" ? "broadcast" : "signature",
    headerFirst: infoChoice(value.headerFirst, FUNCTIONAL_DEFAULT_SETTINGS.headerFirst),
    headerSecond: infoChoice(value.headerSecond, FUNCTIONAL_DEFAULT_SETTINGS.headerSecond),
    showSessionFooter: value.showSessionFooter !== false,
    footerFirst: infoChoice(value.footerFirst, FUNCTIONAL_DEFAULT_SETTINGS.footerFirst),
    footerSecond: infoChoice(value.footerSecond, FUNCTIONAL_DEFAULT_SETTINGS.footerSecond),
  };
}
