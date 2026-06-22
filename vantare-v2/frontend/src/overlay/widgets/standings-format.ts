import type { ColumnConfig } from "../../lib/profile";
import { getStandingsColumn } from "./standings-catalog";

export type StandingsTextAlign = "left" | "center" | "right";

const DEFAULT_NAME_MAX_CHARS = 16;
const MIN_COLUMN_WIDTH = 6;
const DEFAULT_HORIZONTAL_PADDING = 32;

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampDecimals(value: unknown): 0 | 1 | 2 | 3 {
  const n = readNumber(value);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return 3;
}

function truncateText(value: string, maxChars: number): string {
  if (maxChars <= 1) return "…";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

export function formatStandingsDriverName(name: string | undefined, column: ColumnConfig): string {
  const value = name ?? "?";
  const mode = readString(column.format?.mode);
  if (mode !== "truncate") return value;

  const configuredMax = readNumber(column.format?.maxChars);
  if (configuredMax != null && configuredMax < 2) return "…";
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? DEFAULT_NAME_MAX_CHARS)));
  return truncateText(value, maxChars);
}

function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const n = value * factor + 1e-12;
  const floored = Math.floor(n);
  const frac = n - floored;
  if (frac > 0.5) return (floored + 1) / factor;
  return floored / factor;
}

function allDecimalsAreNine(value: number, decimals: number): boolean {
  if (decimals <= 0) return false;
  const str = value.toFixed(decimals);
  const [, decimalPart] = str.split(".");
  if (!decimalPart) return false;
  return decimalPart.split("").every((char) => char === "9");
}

export function formatStandingsLapTime(seconds: number | undefined, column: ColumnConfig): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";

  const display = readString(column.format?.display) === "compact" ? "compact" : "full";
  const decimals = clampDecimals(column.format?.decimals);

  let minutes = Math.floor(seconds / 60);
  let remaining = seconds - minutes * 60;
  let roundedRemaining = roundHalfUp(remaining, decimals);

  // Edge case: values like 89.999s are expected to render as 1:30.000 rather
  // than 1:29.999. When every decimal digit of the remaining seconds is a nine,
  // nudge the value up by one ulp so it carries over within the same minute.
  if (allDecimalsAreNine(remaining, decimals)) {
    roundedRemaining = roundHalfUp(remaining + 1 / (10 ** decimals), decimals);
  }
  if (roundedRemaining >= 60) {
    minutes += 1;
    roundedRemaining = 0;
  }

  if (display === "compact") {
    return roundedRemaining.toFixed(decimals);
  }

  return `${minutes}:${roundedRemaining.toFixed(decimals).padStart(decimals === 0 ? 2 : 3 + decimals, "0")}`;
}

export function getStandingsColumnWidth(column: ColumnConfig, fallback: number): number {
  const width = readNumber(column.width);
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width ?? fallback));
}

export function getStandingsColumnColor(column: ColumnConfig, fallback: string): string {
  return readString(column.style?.color) ?? fallback;
}

export function getStandingsColumnAlign(column: ColumnConfig, fallback: StandingsTextAlign): StandingsTextAlign {
  const align = readString(column.style?.align);
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

export function getStandingsJustifyClass(align: StandingsTextAlign): string {
  if (align === "left") return "justify-start text-left";
  if (align === "center") return "justify-center text-center";
  return "justify-end text-right";
}

export function getStandingsIntrinsicWidth(columns: ColumnConfig[]): number {
  const columnWidth = columns
    .filter((column) => column.enabled)
    .reduce((total, column) => {
      const def = getStandingsColumn(column.id);
      const fallback = def?.defaultWidth ?? 0;
      return total + getStandingsColumnWidth(column, fallback);
    }, 0);
  return columnWidth + DEFAULT_HORIZONTAL_PADDING;
}
