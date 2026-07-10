import type { CSSProperties } from "react";
import { resolveColumnWidthPixels, type WidgetColumnV3 } from "../shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "./relative-content";

const HORIZONTAL_PADDING = 32;

export const RELATIVE_DEFAULT_APPEARANCE = {
  showHeader: true,
  accentColor: "#e63946",
  gapAheadColor: "#f87171",
  gapBehindColor: "#4ade80",
  classHypercarColor: "#c1121f",
  classLmp2Color: "#0055a4",
  classLmp3Color: "#f59e0b",
  classGt3Color: "#2ecc71",
  classUnknownColor: "#6b7280",
} as const;

function columnFallbackWidth(metricId: string): number {
  return (
    RELATIVE_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60
  );
}

export function computeRelativeIntrinsicWidth(columns: readonly WidgetColumnV3[]): number {
  const columnWidth = columns.reduce(
    (total, column) => total + resolveColumnWidthPixels(column, columnFallbackWidth(column.metricId)),
    0,
  );
  return columnWidth + HORIZONTAL_PADDING;
}

export function resolveRelativeClassColor(
  vehicleClass: string | undefined,
  settings: Readonly<Record<string, unknown>>,
): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") {
    return readColor(settings.classHypercarColor, RELATIVE_DEFAULT_APPEARANCE.classHypercarColor);
  }
  if (cls === "LMP2") {
    return readColor(settings.classLmp2Color, RELATIVE_DEFAULT_APPEARANCE.classLmp2Color);
  }
  if (cls === "LMP3") {
    return readColor(settings.classLmp3Color, RELATIVE_DEFAULT_APPEARANCE.classLmp3Color);
  }
  if (cls === "GT3" || cls === "LMGT3") {
    return readColor(settings.classGt3Color, RELATIVE_DEFAULT_APPEARANCE.classGt3Color);
  }
  return readColor(settings.classUnknownColor, RELATIVE_DEFAULT_APPEARANCE.classUnknownColor);
}

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function resolveRelativeGapColor(
  tone: "ahead" | "behind" | "player" | "neutral",
  settings: Readonly<Record<string, unknown>>,
): string | undefined {
  if (tone === "ahead") {
    return readColor(settings.gapAheadColor, RELATIVE_DEFAULT_APPEARANCE.gapAheadColor);
  }
  if (tone === "behind") {
    return readColor(settings.gapBehindColor, RELATIVE_DEFAULT_APPEARANCE.gapBehindColor);
  }
  return undefined;
}

export function buildRelativeAppearanceStyle(
  settings: Readonly<Record<string, unknown>>,
): CSSProperties {
  return {
    "--vo-relative-accent": readColor(settings.accentColor, RELATIVE_DEFAULT_APPEARANCE.accentColor),
    "--vo-relative-gap-ahead": readColor(settings.gapAheadColor, RELATIVE_DEFAULT_APPEARANCE.gapAheadColor),
    "--vo-relative-gap-behind": readColor(
      settings.gapBehindColor,
      RELATIVE_DEFAULT_APPEARANCE.gapBehindColor,
    ),
    "--vc-relative-accent": readColor(settings.accentColor, RELATIVE_DEFAULT_APPEARANCE.accentColor),
    "--vc-relative-gap-ahead": readColor(settings.gapAheadColor, RELATIVE_DEFAULT_APPEARANCE.gapAheadColor),
    "--vc-relative-gap-behind": readColor(
      settings.gapBehindColor,
      RELATIVE_DEFAULT_APPEARANCE.gapBehindColor,
    ),
  } as CSSProperties;
}