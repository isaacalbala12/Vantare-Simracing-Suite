import type { VehicleScoring } from "../../lib/telemetry-ref";
import { selectRelativeRows } from "./relative-filters";
import { formatRelativeLapTime } from "./relative-format";

export function formatLapTime(seconds: number | undefined): string {
  return formatRelativeLapTime(seconds, { id: "lap", metricId: "lap", enabled: true });
}

export function resolveClassColor(
  vehicleClass: string | undefined,
  a: Record<string, unknown>,
): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") return a.classHypercarColor as string;
  if (cls === "LMP2") return a.classLmp2Color as string;
  if (cls === "LMP3") return a.classLmp3Color as string;
  if (cls === "GT3" || cls === "LMGT3") return a.classGt3Color as string;
  return a.classUnknownColor as string;
}

export function formatSignedGap(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds === 0) return "—";
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}`;
}

export function selectRelativeRowsByGap(
  vehicles: Partial<VehicleScoring>[],
  rangeAhead: number,
  rangeBehind: number,
): Partial<VehicleScoring>[] {
  return selectRelativeRows(vehicles, {
    rangeAhead,
    rangeBehind,
    classScope: "all",
    includePlayer: true,
    rowHeightMode: "fill",
  });
}
