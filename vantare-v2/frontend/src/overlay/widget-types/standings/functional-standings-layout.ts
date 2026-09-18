import type { WidgetColumnV3, WidgetColumnWidthPreset } from "../shared/widget-column";
import { FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT } from "./functional-standings-multiclass";

export const FUNCTIONAL_IDENTITY_METRICS: ReadonlySet<string> = new Set(["position", "driverNumber", "driverName", "vehicleClass"]);

// These values are shared with the renderer. Keeping the geometry in one
// place prevents a compact header from being drawn at one height while the
// frame/layout math still reserves the old, roomier one (ISA-1221).
export const FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT = 42;
export const FUNCTIONAL_SIGNATURE_COLUMN_HEADER_HEIGHT = 28;
export const FUNCTIONAL_BROADCAST_SESSION_HEADER_HEIGHT = 46;
export const FUNCTIONAL_BROADCAST_COLUMN_HEADER_HEIGHT = 24;

const WIDTHS: Readonly<Record<string, number>> = {
  position: 30, driverNumber: 30, gap: 86, interval: 76, lastLap: 76,
  bestLap: 76, pit: 32, currentLap: 48, vehicleClass: 54, tireCompound: 44,
};

// Presets add modest breathing room to readable minima; timing text never
// shrinks below them and the columns stay visually joined (ISA-1221).
const PRESET_EXTRA: Readonly<Record<WidgetColumnWidthPreset, number>> = { xs: 0, sm: 0, md: 6, lg: 12, auto: 0 };


// Formatted names keep measured readable minima; the cell padding is compacted
// separately: "Alessandro Pier Guidi" ≈ 166, "F. Albuquerque" ≈ 118,
// "Albuquerque" ≈ 103. Broadcast keeps its +20 signature.
const NAME_WIDTH: Readonly<Record<string, number>> = { initial: 140, surname: 124 };

function driverNameMinimum(column: WidgetColumnV3, broadcast: boolean): number {
  const base = broadcast ? 208 : 188;
  const mode = column.format?.mode;
  if (mode === "truncate") {
    const maxChars = typeof column.format?.maxChars === "number" ? column.format.maxChars : 16;
    return Math.max(96, Math.min(base, Math.round(maxChars * 8.4) + 24));
  }
  const minimum = typeof mode === "string" ? NAME_WIDTH[mode] : undefined;
  return minimum == null ? base : minimum + (broadcast ? 20 : 0);
}

export function resolveFunctionalColumnWidth(column: WidgetColumnV3, broadcast = false): number {
  const minimum = column.metricId === "driverName" ? driverNameMinimum(column, broadcast) : WIDTHS[column.metricId] ?? 72;
  return minimum + PRESET_EXTRA[column.widthPreset];
}

function resolveFunctionalHeaderColumnWidth(column: WidgetColumnV3): number {
  // The identity prefix owns the session header. A display-only name format
  // must not move that header into a second row just because the visible
  // surname is shorter than the full name.
  if (column.metricId === "driverName" && column.format?.mode && column.format.mode !== "full") {
    return resolveFunctionalColumnWidth({ ...column, format: undefined });
  }
  return resolveFunctionalColumnWidth(column);
}

export function resolveFunctionalIdentitySpan(columns: readonly WidgetColumnV3[]): number {
  const firstMetric = columns.findIndex((column) => !FUNCTIONAL_IDENTITY_METRICS.has(column.metricId));
  const span = firstMetric === -1 ? columns.length : firstMetric;
  const prefix = columns.slice(0, span);
  const width = prefix.reduce((sum, column) => sum + resolveFunctionalHeaderColumnWidth(column), 0);
  // Name-only and position-only prefixes cannot hold the session header.
  return prefix.some((column) => column.metricId === "driverName") && width >= 238 ? span : 0;
}

export function resolveFunctionalHeaderInfoPlacement(
  columns: readonly WidgetColumnV3[], settings: Readonly<Record<string, unknown>>,
): "none" | "inline" | "split" | "band" {
  // Standings Eficiencia has one session header only. The former track/air
  // information band created a second numeric header and is intentionally no
  // longer part of this design; keep this resolver as a compatibility seam for
  // older callers and saved settings.
  void columns;
  void settings;
  return "none";
}

export function resolveFunctionalStandingsSize(
  columns: readonly WidgetColumnV3[],
  rowCount: number,
  settings: Readonly<Record<string, unknown>>,
  rowHeight = 30,
  classBandCount = 0,
): { width: number; height: number } {
  const broadcast = settings.templateId === "broadcast";
  // Pit is an inline row status in Eficiencia, so it never reserves a table
  // column or changes the widget's intrinsic width.
  const enabled = columns.filter((column) => column.enabled && column.metricId !== "pit");
  const width = enabled.reduce((sum, column) =>
    sum + resolveFunctionalColumnWidth(column, broadcast), 0);
  const identitySpan = resolveFunctionalIdentitySpan(enabled);
  const signatureTableHeader = settings.showSessionHeader === false || identitySpan === 0
    ? FUNCTIONAL_SIGNATURE_COLUMN_HEADER_HEIGHT
    : FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT;
  const header = broadcast
    ? FUNCTIONAL_BROADCAST_COLUMN_HEADER_HEIGHT + (settings.showSessionHeader === false ? 0 : FUNCTIONAL_BROADCAST_SESSION_HEADER_HEIGHT)
    : (settings.showSessionHeader === false ? 0 : signatureTableHeader)
      + (identitySpan === 0 && settings.showSessionHeader !== false ? FUNCTIONAL_SIGNATURE_SESSION_HEADER_HEIGHT : 0);
  // El pie ambiente (pista/aire/viento) mide 30px y prevalece sobre el pie de
  // sesión de 22px cuando hay datos — el tamaño mínimo presupone el caso real.
  const footer = settings.showSessionFooter === false ? 0 : 30;
  const brandBand = settings.brandVisible === true && settings.showSessionHeader === false ? 22 : 0;
  return {
    width: Math.max(broadcast ? 258 : 238, width),
    height: header + brandBand + rowCount * rowHeight
      + Math.max(0, classBandCount) * FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT + footer,
  };
}
