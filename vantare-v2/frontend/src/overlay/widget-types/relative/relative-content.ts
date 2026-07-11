import {
  cloneWidgetColumns,
  validateWidgetColumns,
  WIDTH_PRESET_PIXELS,
  type WidgetColumnV3,
  type WidgetColumnWidthPreset,
} from "../shared/widget-column";

export type RelativeMetricId =
  | "position"
  | "class"
  | "carNumber"
  | "driverName"
  | "gap"
  | "bestLap"
  | "lastLap";

export type RelativeClassScope = "all" | "sameClass";
export type RelativeRowHeightMode = "compact" | "fill";

export type RelativeContent = {
  columns: WidgetColumnV3[];
  rangeAhead: number;
  rangeBehind: number;
  classScope: RelativeClassScope;
  includePlayer: boolean;
  rowHeightMode: RelativeRowHeightMode;
};

export const RELATIVE_METRIC_IDS: readonly RelativeMetricId[] = [
  "position",
  "class",
  "carNumber",
  "driverName",
  "gap",
  "bestLap",
  "lastLap",
];

export const RELATIVE_RANGE_MIN = 0;
export const RELATIVE_RANGE_MAX = 20;

type RelativeColumnTemplate = {
  id: string;
  metricId: RelativeMetricId;
  label: string;
  defaultEnabled: boolean;
  defaultWidth: number;
  format?: WidgetColumnV3["format"];
  style?: WidgetColumnV3["style"];
};

export const RELATIVE_COLUMN_TEMPLATES: readonly RelativeColumnTemplate[] = [
  { id: "position", metricId: "position", label: "Posición", defaultEnabled: true, defaultWidth: 24, style: { align: "center" } },
  { id: "class", metricId: "class", label: "Clase", defaultEnabled: true, defaultWidth: 6, style: { align: "center" } },
  { id: "carNumber", metricId: "carNumber", label: "Número", defaultEnabled: true, defaultWidth: 28, style: { align: "center" } },
  {
    id: "driverName",
    metricId: "driverName",
    label: "Piloto",
    defaultEnabled: true,
    defaultWidth: 120,
    format: { mode: "full", maxChars: 18 },
    style: { align: "left" },
  },
  { id: "gap", metricId: "gap", label: "Gap", defaultEnabled: true, defaultWidth: 48, style: { align: "right" } },
  {
    id: "bestLap",
    metricId: "bestLap",
    label: "Mejor vuelta",
    defaultEnabled: false,
    defaultWidth: 62,
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
  {
    id: "lastLap",
    metricId: "lastLap",
    label: "Última vuelta",
    defaultEnabled: false,
    defaultWidth: 62,
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
];

const PRESET_ENTRIES = Object.entries(WIDTH_PRESET_PIXELS) as [Exclude<WidgetColumnWidthPreset, "auto">, number][];

function nearestWidthPreset(width: number): WidgetColumnWidthPreset {
  let best: WidgetColumnWidthPreset = "md";
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPixels = WIDTH_PRESET_PIXELS.md;
  for (const [preset, pixels] of PRESET_ENTRIES) {
    const distance = Math.abs(pixels - width);
    if (distance < bestDistance || (distance === bestDistance && pixels > bestPixels)) {
      bestDistance = distance;
      bestPixels = pixels;
      best = preset;
    }
  }
  return best;
}

function clampRange(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(RELATIVE_RANGE_MIN, Math.min(RELATIVE_RANGE_MAX, Math.round(value)));
}

function readClassScope(value: unknown, fallback: RelativeClassScope): RelativeClassScope {
  return value === "sameClass" || value === "all" ? value : fallback;
}

function readRowHeightMode(value: unknown, fallback: RelativeRowHeightMode): RelativeRowHeightMode {
  if (value === "compact" || value === "fill") {
    return value;
  }
  if (value === "comfortable") {
    return "fill";
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function createDefaultRelativeContent(): RelativeContent {
  return {
    columns: RELATIVE_COLUMN_TEMPLATES.map((template) => ({
      id: template.id,
      metricId: template.metricId,
      enabled: template.defaultEnabled,
      widthPreset: template.metricId === "class" ? "auto" : nearestWidthPreset(template.defaultWidth),
      ...(template.format ? { format: structuredClone(template.format) } : {}),
      ...(template.style ? { style: structuredClone(template.style) } : {}),
    })),
    rangeAhead: 3,
    rangeBehind: 3,
    classScope: "all",
    includePlayer: true,
    rowHeightMode: "compact",
  };
}

function normalizeLegacyColumn(raw: Record<string, unknown>): WidgetColumnV3 {
  const id = String(raw.id ?? "");
  const metricId = String(raw.metricId ?? raw.id ?? "");
  const enabled = raw.enabled !== false;
  const widthPreset =
    typeof raw.widthPreset === "string" &&
    ["xs", "sm", "md", "lg", "auto"].includes(raw.widthPreset)
      ? (raw.widthPreset as WidgetColumnWidthPreset)
      : nearestWidthPreset(typeof raw.width === "number" ? raw.width : 60);

  const column: WidgetColumnV3 = { id, metricId, enabled, widthPreset };
  if (raw.format && typeof raw.format === "object" && !Array.isArray(raw.format)) {
    column.format = structuredClone(raw.format as Record<string, unknown>);
  }
  if (raw.style && typeof raw.style === "object" && !Array.isArray(raw.style)) {
    const style = raw.style as Record<string, unknown>;
    column.style = {
      align:
        style.align === "left" || style.align === "center" || style.align === "right"
          ? style.align
          : undefined,
    };
  }
  return column;
}

function readFilterFields(source: Record<string, unknown>): Partial<RelativeContent> {
  const patch: Partial<RelativeContent> = {};
  if ("rangeAhead" in source) {
    patch.rangeAhead = clampRange(source.rangeAhead, 3);
  }
  if ("rangeBehind" in source) {
    patch.rangeBehind = clampRange(source.rangeBehind, 3);
  }
  if ("classScope" in source) {
    patch.classScope = readClassScope(source.classScope, "all");
  }
  if ("includePlayer" in source) {
    patch.includePlayer = readBoolean(source.includePlayer, true);
  }
  if ("rowHeightMode" in source) {
    patch.rowHeightMode = readRowHeightMode(source.rowHeightMode, "compact");
  }
  return patch;
}

export function parseRelativeContent(input: unknown): RelativeContent {
  if (input === undefined || input === null) {
    return createDefaultRelativeContent();
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("relative content must be an object");
  }

  const raw = input as Record<string, unknown>;
  const defaults = createDefaultRelativeContent();
  const filters =
    raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters)
      ? (raw.filters as Record<string, unknown>)
      : {};
  const filterPatch = readFilterFields({ ...raw, ...filters });

  let columns = defaults.columns;
  const rawColumns = raw.columns;
  if (Array.isArray(rawColumns)) {
    columns = rawColumns.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error("relative column must be an object");
      }
      return normalizeLegacyColumn(entry as Record<string, unknown>);
    });
    validateWidgetColumns(columns, { allowedMetricIds: RELATIVE_METRIC_IDS });

    const seenMetricIds = new Set<string>();
    for (const column of columns) {
      if (seenMetricIds.has(column.metricId)) {
        throw new Error(`duplicate metric id: ${column.metricId}`);
      }
      seenMetricIds.add(column.metricId);
    }
  }

  return {
    columns,
    rangeAhead: filterPatch.rangeAhead ?? defaults.rangeAhead,
    rangeBehind: filterPatch.rangeBehind ?? defaults.rangeBehind,
    classScope: filterPatch.classScope ?? defaults.classScope,
    includePlayer: filterPatch.includePlayer ?? defaults.includePlayer,
    rowHeightMode: filterPatch.rowHeightMode ?? defaults.rowHeightMode,
  };
}

export function getEnabledRelativeColumns(content: RelativeContent): WidgetColumnV3[] {
  return content.columns.filter((column) => column.enabled);
}

export function toggleRelativeColumn(content: RelativeContent, columnId: string): RelativeContent {
  return {
    ...content,
    columns: content.columns.map((column) =>
      column.id === columnId ? { ...column, enabled: !column.enabled } : column,
    ),
  };
}

export function moveRelativeColumn(
  content: RelativeContent,
  columnId: string,
  direction: "up" | "down",
): RelativeContent {
  const index = content.columns.findIndex((column) => column.id === columnId);
  if (index < 0) {
    return content;
  }
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= content.columns.length) {
    return content;
  }
  const columns = cloneWidgetColumns(content.columns);
  const [entry] = columns.splice(index, 1);
  if (!entry) {
    return content;
  }
  columns.splice(targetIndex, 0, entry);
  return { ...content, columns };
}

export function updateRelativeColumn(
  content: RelativeContent,
  columnId: string,
  patch: Partial<Pick<WidgetColumnV3, "widthPreset" | "style">>,
): RelativeContent {
  return {
    ...content,
    columns: content.columns.map((column) =>
      column.id === columnId ? { ...column, ...patch, style: { ...column.style, ...patch.style } } : column,
    ),
  };
}

export function updateRelativeFilters(
  content: RelativeContent,
  patch: Partial<
    Pick<RelativeContent, "rangeAhead" | "rangeBehind" | "classScope" | "includePlayer" | "rowHeightMode">
  >,
): RelativeContent {
  return {
    ...content,
    ...(patch.rangeAhead !== undefined ? { rangeAhead: clampRange(patch.rangeAhead, content.rangeAhead) } : {}),
    ...(patch.rangeBehind !== undefined ? { rangeBehind: clampRange(patch.rangeBehind, content.rangeBehind) } : {}),
    ...(patch.classScope !== undefined ? { classScope: readClassScope(patch.classScope, content.classScope) } : {}),
    ...(patch.includePlayer !== undefined ? { includePlayer: patch.includePlayer } : {}),
    ...(patch.rowHeightMode !== undefined
      ? { rowHeightMode: readRowHeightMode(patch.rowHeightMode, content.rowHeightMode) }
      : {}),
  };
}