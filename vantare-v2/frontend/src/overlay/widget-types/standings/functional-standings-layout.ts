import type { WidgetColumnV3, WidgetColumnWidthPreset } from "../shared/widget-column";

export const FUNCTIONAL_IDENTITY_METRICS: ReadonlySet<string> = new Set(["position", "driverNumber", "driverName", "vehicleClass"]);

const WIDTHS: Readonly<Record<string, number>> = {
  position: 34, driverNumber: 36, gap: 86, interval: 86, lastLap: 104,
  bestLap: 104, pit: 42, currentLap: 52, vehicleClass: 60, tireCompound: 48,
};

// Presets add breathing room to readable minima; timing text never shrinks below them.
const PRESET_EXTRA: Readonly<Record<WidgetColumnWidthPreset, number>> = { xs: 0, sm: 0, md: 12, lg: 24, auto: 0 };

export function resolveFunctionalColumnWidth(column: WidgetColumnV3, broadcast = false): number {
  const minimum = column.metricId === "driverName" ? (broadcast ? 224 : 204) : WIDTHS[column.metricId] ?? 72;
  return minimum + PRESET_EXTRA[column.widthPreset];
}

export function resolveFunctionalIdentitySpan(columns: readonly WidgetColumnV3[]): number {
  const firstMetric = columns.findIndex((column) => !FUNCTIONAL_IDENTITY_METRICS.has(column.metricId));
  const span = firstMetric === -1 ? columns.length : firstMetric;
  const prefix = columns.slice(0, span);
  const width = prefix.reduce((sum, column) => sum + resolveFunctionalColumnWidth(column), 0);
  // Name-only and position-only prefixes cannot hold the session header.
  return prefix.some((column) => column.metricId === "driverName") && width >= 238 ? span : 0;
}

export function resolveFunctionalStandingsSize(
  columns: readonly WidgetColumnV3[], rowCount: number, settings: Readonly<Record<string, unknown>>,
): { width: number; height: number } {
  const broadcast = settings.templateId === "broadcast";
  const enabled = columns.filter((column) => column.enabled);
  const width = enabled.reduce((sum, column) =>
    sum + resolveFunctionalColumnWidth(column, broadcast), 0);
  const separateSignatureHeader = settings.showSessionHeader !== false
    && resolveFunctionalIdentitySpan(enabled) === 0;
  const header = broadcast ? 24 + (settings.showSessionHeader === false ? 0 : 46)
    : 50 + (separateSignatureHeader ? 49 : 0);
  return { width: Math.max(broadcast ? 258 : 238, width), height: header + rowCount * 30 };
}
