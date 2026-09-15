import type { WidgetColumnV3, WidgetColumnWidthPreset } from "../shared/widget-column";

export const FUNCTIONAL_IDENTITY_METRICS: ReadonlySet<string> = new Set(["position", "driverNumber", "driverName", "vehicleClass"]);

const WIDTHS: Readonly<Record<string, number>> = {
  position: 34, driverNumber: 36, gap: 84, interval: 84, lastLap: 84,
  bestLap: 84, pit: 36, currentLap: 52, vehicleClass: 60, tireCompound: 48,
};

// Presets add breathing room to readable minima; timing text never shrinks below them.
const PRESET_EXTRA: Readonly<Record<WidgetColumnWidthPreset, number>> = { xs: 0, sm: 0, md: 12, lg: 24, auto: 0 };

// Formatted names have narrower readable minima: "F. Albuquerque" ≈ 118px,
// "Albuquerque" ≈ 103px, plus cell padding. Broadcast keeps its +20 signature.
const NAME_WIDTH: Readonly<Record<string, number>> = { initial: 152, surname: 128 };

function driverNameMinimum(column: WidgetColumnV3, broadcast: boolean): number {
  const base = broadcast ? 224 : 204;
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

export function resolveFunctionalIdentitySpan(columns: readonly WidgetColumnV3[]): number {
  const firstMetric = columns.findIndex((column) => !FUNCTIONAL_IDENTITY_METRICS.has(column.metricId));
  const span = firstMetric === -1 ? columns.length : firstMetric;
  const prefix = columns.slice(0, span);
  const width = prefix.reduce((sum, column) => sum + resolveFunctionalColumnWidth(column), 0);
  // Name-only and position-only prefixes cannot hold the session header.
  return prefix.some((column) => column.metricId === "driverName") && width >= 238 ? span : 0;
}

export function resolveFunctionalHeaderInfoPlacement(
  columns: readonly WidgetColumnV3[], settings: Readonly<Record<string, unknown>>,
): "none" | "inline" | "split" | "band" {
  const count = [settings.headerFirst, settings.headerSecond].filter((metric) => metric !== "none").length;
  if (settings.showSessionHeader === false || count === 0) return "none";
  const enabled = columns.filter((column) => column.enabled);
  const broadcast = settings.templateId === "broadcast";
  const identitySpan = resolveFunctionalIdentitySpan(enabled);
  const inline = broadcast || identitySpan === 0;
  const width = enabled.reduce((sum, column) => sum + resolveFunctionalColumnWidth(column, broadcast), 0);
  const available = inline
    ? width - 238
    : enabled.slice(identitySpan).reduce((sum, column) => sum + resolveFunctionalColumnWidth(column), 0) - 20;
  return available >= count * 72 + (count - 1) * 14 ? (inline ? "inline" : "split") : "band";
}

export function resolveFunctionalStandingsSize(
  columns: readonly WidgetColumnV3[], rowCount: number, settings: Readonly<Record<string, unknown>>, rowHeight = 30,
): { width: number; height: number } {
  const broadcast = settings.templateId === "broadcast";
  const enabled = columns.filter((column) => column.enabled);
  const width = enabled.reduce((sum, column) =>
    sum + resolveFunctionalColumnWidth(column, broadcast), 0);
  const separateSignatureHeader = settings.showSessionHeader !== false
    && resolveFunctionalIdentitySpan(enabled) === 0;
  const header = broadcast ? 24 + (settings.showSessionHeader === false ? 0 : 46)
    : 50 + (separateSignatureHeader ? 49 : 0);
  // El pie ambiente (pista/aire/viento) mide 30px y prevalece sobre el pie de
  // sesión de 22px cuando hay datos — el tamaño mínimo presupone el caso real.
  const footer = settings.showSessionFooter === false ? 0 : 30;
  const infoBand = resolveFunctionalHeaderInfoPlacement(enabled, settings) === "band" ? 22 : 0;
  const brandBand = settings.brandVisible === true && settings.showSessionHeader === false ? 22 : 0;
  return { width: Math.max(broadcast ? 258 : 238, width), height: header + infoBand + brandBand + rowCount * rowHeight + footer };
}
