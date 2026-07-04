import type { ColumnConfig } from "../../lib/profile";

export type RelativeTextAlign = "left" | "center" | "right";

const DEFAULT_NAME_MAX_CHARS = 18;
const MIN_COLUMN_WIDTH = 6;
const DEFAULT_HORIZONTAL_PADDING = 32;
export const DEFAULT_RELATIVE_COLUMN_WIDTHS: Record<string, number> = {
  position: 24,
  class: 6,
  carNumber: 28,
  driverName: 120,
  gap: 48,
  bestLap: 62,
  lastLap: 62,
};

export const RELATIVE_COMPACT_ROW_HEIGHT = 31;
export const RELATIVE_COMPACT_NON_ROW_HEIGHT = 68;

export function getRelativeCompactHeight(rowCount: number): number {
  const safeRows = Number.isFinite(rowCount) ? Math.max(0, Math.round(rowCount)) : 0;
  return RELATIVE_COMPACT_NON_ROW_HEIGHT + safeRows * RELATIVE_COMPACT_ROW_HEIGHT;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
const WIDTH_PRESET_MAP: Record<string, number> = {
  xs: 20,
  sm: 36,
  md: 60,
  lg: 90,
  auto: 0,
};

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

export function formatRelativeDriverName(name: string | undefined, column: ColumnConfig): string {
  const value = name ?? "?";
  const mode = readString(column.format?.mode);
  if (mode !== "truncate") return value;

  const configuredMax = readNumber(column.format?.maxChars);
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? DEFAULT_NAME_MAX_CHARS)));
  return truncateText(value, maxChars);
}

export function formatRelativeLapTime(seconds: number | undefined, column: ColumnConfig): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";

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

export function getRelativeColumnWidth(column: ColumnConfig, fallback: number): number {
  const width = readNumber(column.width);
  if (width != null) return Math.max(MIN_COLUMN_WIDTH, Math.round(width));
  const presetWidth = column.widthPreset ? WIDTH_PRESET_MAP[column.widthPreset] : undefined;
  if (presetWidth != null && presetWidth > 0) return Math.max(MIN_COLUMN_WIDTH, presetWidth);
  return Math.max(MIN_COLUMN_WIDTH, Math.round(fallback));
}

export function getRelativeColumnColor(column: ColumnConfig, fallback: string): string {
  return readString(column.style?.color) ?? fallback;
}

export function getRelativeColumnAlign(column: ColumnConfig, fallback: RelativeTextAlign): RelativeTextAlign {
  const align = readString(column.style?.align);
  if (align === "left" || align === "center" || align === "right") return align;
  return fallback;
}

export function getRelativeJustifyClass(align: RelativeTextAlign): string {
  if (align === "left") return "justify-start text-left";
  if (align === "center") return "justify-center text-center";
  return "justify-end text-right";
}

export function getRelativeIntrinsicWidth(columns: ColumnConfig[]): number {
  const columnWidth = columns
    .filter((column) => column.enabled)
    .reduce((total, column) => total + getRelativeColumnWidth(column, DEFAULT_RELATIVE_COLUMN_WIDTHS[column.id] ?? 0), 0);
  return columnWidth + DEFAULT_HORIZONTAL_PADDING;
}
