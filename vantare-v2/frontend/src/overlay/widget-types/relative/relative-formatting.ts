import type { WidgetColumnV3 } from "../shared/widget-column";
import { readScoringNumber, readScoringString } from "../shared/scoring-readers";

export type RelativeScoringRow = Record<string, unknown>;

const PLACEHOLDER = "—";

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampDecimals(value: unknown): 0 | 1 | 2 | 3 {
  const n = readNumber(value);
  if (n === 0 || n === 1 || n === 2 || n === 3) {
    return n;
  }
  return 3;
}

function truncateText(value: string, maxChars: number): string {
  if (maxChars <= 1) {
    return "…";
  }
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1)}…`;
}

export function formatRelativeDriverName(name: string | undefined, column: WidgetColumnV3): string {
  const value = name ?? "?";
  const mode = readString(column.format?.mode);
  if (mode !== "truncate") {
    return value;
  }
  const configuredMax = readNumber(column.format?.maxChars);
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? 18)));
  return truncateText(value, maxChars);
}

export function formatRelativeLapTime(seconds: number | undefined, column: WidgetColumnV3): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }
  const display = readString(column.format?.display) === "compact" ? "compact" : "full";
  const decimals = clampDecimals(column.format?.decimals);
  let minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  let roundedRemaining = Number(remaining.toFixed(decimals));
  if (roundedRemaining >= 60) {
    minutes += 1;
    roundedRemaining -= 60;
  }
  if (display === "compact") {
    return roundedRemaining.toFixed(decimals);
  }
  return `${minutes}:${roundedRemaining.toFixed(decimals).padStart(decimals === 0 ? 2 : 3 + decimals, "0")}`;
}

export function formatRelativeGap(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds === 0) {
    return PLACEHOLDER;
  }
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}`;
}

export function formatRelativeColumnValue(
  metricId: string,
  row: RelativeScoringRow,
  column: WidgetColumnV3,
): string {
  switch (metricId) {
    case "position":
      return String(readScoringNumber(row, "place") ?? PLACEHOLDER);
    case "class":
      return readScoringString(row, "vehicleClass") ?? "";
    case "carNumber":
      return readScoringString(row, "driverNumber") ?? "";
    case "driverName":
      return formatRelativeDriverName(readScoringString(row, "driverName"), column);
    case "gap":
      return formatRelativeGap(readScoringNumber(row, "timeGapToPlayer"));
    case "bestLap":
      return formatRelativeLapTime(readScoringNumber(row, "bestLapTime"), column);
    case "lastLap":
      return formatRelativeLapTime(readScoringNumber(row, "lastLapTime"), column);
    default:
      return "";
  }
}