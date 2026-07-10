export type WidgetColumnWidthPreset = "xs" | "sm" | "md" | "lg" | "auto";

export type WidgetColumnV3 = {
  id: string;
  metricId: string;
  enabled: boolean;
  widthPreset: WidgetColumnWidthPreset;
  format?: Record<string, unknown>;
  style?: { align?: "left" | "center" | "right" };
};

export const WIDTH_PRESET_PIXELS: Record<Exclude<WidgetColumnWidthPreset, "auto">, number> = {
  xs: 20,
  sm: 36,
  md: 60,
  lg: 90,
};

const MIN_COLUMN_WIDTH = 6;
const SAFE_FORMAT_KEY = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const FORBIDDEN_FORMAT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type ValidateWidgetColumnsOptions = {
  allowedMetricIds: readonly string[];
};

function isSafeFormatValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  return typeof value === "number" && Number.isFinite(value);
}

function validateColumnFormat(format: Record<string, unknown> | undefined): void {
  if (!format) {
    return;
  }
  for (const [key, value] of Object.entries(format)) {
    if (FORBIDDEN_FORMAT_KEYS.has(key) || !SAFE_FORMAT_KEY.test(key)) {
      throw new Error(`unsafe format key: ${key}`);
    }
    if (!isSafeFormatValue(value)) {
      throw new Error(`unsafe format value for key: ${key}`);
    }
  }
}

export function validateWidgetColumns(
  columns: readonly WidgetColumnV3[],
  options: ValidateWidgetColumnsOptions,
): void {
  const allowedMetrics = new Set(options.allowedMetricIds);
  const seenIds = new Set<string>();

  for (const column of columns) {
    if (!column.id.trim()) {
      throw new Error("column id is required");
    }
    if (seenIds.has(column.id)) {
      throw new Error(`duplicate id: ${column.id}`);
    }
    seenIds.add(column.id);

    if (!allowedMetrics.has(column.metricId)) {
      throw new Error(`unknown metric id: ${column.metricId}`);
    }

    validateColumnFormat(column.format);
  }
}

export function resolveColumnWidthPixels(column: WidgetColumnV3, fallback: number): number {
  if (column.widthPreset === "auto") {
    return Math.max(MIN_COLUMN_WIDTH, Math.round(fallback));
  }
  return Math.max(MIN_COLUMN_WIDTH, WIDTH_PRESET_PIXELS[column.widthPreset]);
}

export function cloneWidgetColumns(columns: readonly WidgetColumnV3[]): WidgetColumnV3[] {
  return columns.map((column) => structuredClone(column));
}