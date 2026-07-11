import {
  cloneWidgetColumns,
  validateWidgetColumns,
  WIDTH_PRESET_PIXELS,
  type WidgetColumnV3,
  type WidgetColumnWidthPreset,
} from "../shared/widget-column";

export type StandingsMetricId =
  | "position"
  | "driverNumber"
  | "driverName"
  | "vehicleClass"
  | "gap"
  | "interval"
  | "currentLap"
  | "lastLap"
  | "bestLap"
  | "pit"
  | "tireCompound";

export type StandingsContent = {
  columns: WidgetColumnV3[];
};

export const STANDINGS_METRIC_IDS: readonly StandingsMetricId[] = [
  "position",
  "driverNumber",
  "driverName",
  "vehicleClass",
  "gap",
  "interval",
  "currentLap",
  "lastLap",
  "bestLap",
  "pit",
  "tireCompound",
];

type StandingsColumnTemplate = {
  id: string;
  metricId: StandingsMetricId;
  label: string;
  defaultEnabled: boolean;
  defaultWidth: number;
  format?: WidgetColumnV3["format"];
  style?: WidgetColumnV3["style"];
};

export const STANDINGS_COLUMN_TEMPLATES: readonly StandingsColumnTemplate[] = [
  { id: "position", metricId: "position", label: "Posición", defaultEnabled: true, defaultWidth: 28 },
  { id: "driverNumber", metricId: "driverNumber", label: "Número", defaultEnabled: true, defaultWidth: 42 },
  {
    id: "driverName",
    metricId: "driverName",
    label: "Piloto",
    defaultEnabled: true,
    defaultWidth: 132,
    format: { mode: "full", maxChars: 16 },
    style: { align: "left" },
  },
  {
    id: "gap",
    metricId: "gap",
    label: "Gap",
    defaultEnabled: true,
    defaultWidth: 70,
    style: { align: "right" },
  },
  {
    id: "bestLap",
    metricId: "bestLap",
    label: "Mejor vuelta",
    defaultEnabled: true,
    defaultWidth: 76,
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
  { id: "vehicleClass", metricId: "vehicleClass", label: "Clase", defaultEnabled: false, defaultWidth: 64 },
  {
    id: "currentLap",
    metricId: "currentLap",
    label: "Vuelta",
    defaultEnabled: false,
    defaultWidth: 52,
    style: { align: "right" },
  },
  {
    id: "interval",
    metricId: "interval",
    label: "Intervalo",
    defaultEnabled: false,
    defaultWidth: 70,
    style: { align: "right" },
  },
  {
    id: "lastLap",
    metricId: "lastLap",
    label: "Última vuelta",
    defaultEnabled: false,
    defaultWidth: 76,
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
  { id: "pit", metricId: "pit", label: "Pit", defaultEnabled: false, defaultWidth: 48 },
  { id: "tireCompound", metricId: "tireCompound", label: "Neumático", defaultEnabled: false, defaultWidth: 48 },
];

const PRESET_ENTRIES = Object.entries(WIDTH_PRESET_PIXELS) as [Exclude<WidgetColumnWidthPreset, "auto">, number][];

export function nearestWidthPreset(width: number): WidgetColumnWidthPreset {
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

export function createDefaultStandingsContent(): StandingsContent {
  return {
    columns: STANDINGS_COLUMN_TEMPLATES.map((template) => ({
      id: template.id,
      metricId: template.metricId,
      enabled: template.defaultEnabled,
      widthPreset: nearestWidthPreset(template.defaultWidth),
      ...(template.format ? { format: structuredClone(template.format) } : {}),
      ...(template.style ? { style: structuredClone(template.style) } : {}),
    })),
  };
}

function normalizeLegacyMetricId(metricId: string): string {
  if (metricId === "name") {
    return "driverName";
  }
  return metricId;
}

function normalizeLegacyColumn(raw: Record<string, unknown>): WidgetColumnV3 {
  const id = normalizeLegacyMetricId(String(raw.id ?? ""));
  const metricId = normalizeLegacyMetricId(String(raw.metricId ?? raw.id ?? ""));
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

export function parseStandingsContent(input: unknown): StandingsContent {
  if (input === undefined || input === null) {
    return createDefaultStandingsContent();
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("standings content must be an object");
  }
  const defaults = createDefaultStandingsContent();
  const rawColumns = (input as Record<string, unknown>).columns;
  if (!Array.isArray(rawColumns)) {
    return defaults;
  }
  const columns = rawColumns.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("standings column must be an object");
    }
    return normalizeLegacyColumn(entry as Record<string, unknown>);
  });
  validateWidgetColumns(columns, { allowedMetricIds: STANDINGS_METRIC_IDS });

  const seenMetricIds = new Set<string>();
  for (const column of columns) {
    if (seenMetricIds.has(column.metricId)) {
      throw new Error(`duplicate metric id: ${column.metricId}`);
    }
    seenMetricIds.add(column.metricId);
  }

  return { columns };
}

export function getEnabledStandingsColumns(content: StandingsContent): WidgetColumnV3[] {
  return content.columns.filter((column) => column.enabled);
}

export function toggleStandingsColumn(content: StandingsContent, columnId: string): StandingsContent {
  return {
    columns: content.columns.map((column) =>
      column.id === columnId ? { ...column, enabled: !column.enabled } : column,
    ),
  };
}

export function moveStandingsColumn(
  content: StandingsContent,
  columnId: string,
  direction: "up" | "down",
): StandingsContent {
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
  return { columns };
}

export function updateStandingsColumn(
  content: StandingsContent,
  columnId: string,
  patch: Partial<Pick<WidgetColumnV3, "widthPreset" | "style">>,
): StandingsContent {
  return {
    columns: content.columns.map((column) =>
      column.id === columnId ? { ...column, ...patch, style: { ...column.style, ...patch.style } } : column,
    ),
  };
}