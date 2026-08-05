import type { CSSProperties } from "react";

export const STANDINGS_DEFAULT_APPEARANCE = {
  showSessionHeader: true,
  compactRows: false,
  accentColor: "#e63946",
  classHypercarColor: "#c1121f",
  classLmp2Color: "#0055a4",
  classLmp3Color: "#f59e0b",
  classGt3Color: "#2ecc71",
  classUnknownColor: "#6b7280",
} as const;

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function resolveStandingsClassColor(
  vehicleClass: string | undefined,
  settings: Readonly<Record<string, unknown>>,
): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") {
    return readColor(settings.classHypercarColor, STANDINGS_DEFAULT_APPEARANCE.classHypercarColor);
  }
  if (cls === "LMP2") {
    return readColor(settings.classLmp2Color, STANDINGS_DEFAULT_APPEARANCE.classLmp2Color);
  }
  if (cls === "LMP3") {
    return readColor(settings.classLmp3Color, STANDINGS_DEFAULT_APPEARANCE.classLmp3Color);
  }
  if (cls === "GT3" || cls === "LMGT3") {
    return readColor(settings.classGt3Color, STANDINGS_DEFAULT_APPEARANCE.classGt3Color);
  }
  return readColor(settings.classUnknownColor, STANDINGS_DEFAULT_APPEARANCE.classUnknownColor);
}

export function buildStandingsAppearanceStyle(
  settings: Readonly<Record<string, unknown>>,
): CSSProperties {
  return {
    "--vo-standings-accent": readColor(
      settings.accentColor,
      STANDINGS_DEFAULT_APPEARANCE.accentColor,
    ),
  } as CSSProperties;
}
