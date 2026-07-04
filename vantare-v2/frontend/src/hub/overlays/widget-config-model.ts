import type {
  SlotConfig,
  ColumnConfig,
  ColumnGroupConfig,
  WidgetVariantConfig,
} from "../../lib/profile";

export type MetricCatalogEntry = {
  id: string;
  label: string;
  compatibleWidgets: string[];
  category?: string;
};

// ---------------------------------------------------------------------------
// Widget-type → default model definitions
// ---------------------------------------------------------------------------

interface WidgetDefaults {
  slots: SlotConfig[];
  columns: ColumnConfig[];
  columnGroups: ColumnGroupConfig[];
}

const STANDINGS_COLUMNS: ColumnConfig[] = [
  { id: "position", metricId: "pos", enabled: true, width: 24 },
  { id: "carNumber", metricId: "carNumber", enabled: true, width: 30 },
  { id: "driver", metricId: "driverName", enabled: true, width: 1 },
  { id: "class", metricId: "className", enabled: true, width: 36 },
  { id: "gap", metricId: "gap", enabled: true, width: 60 },
  { id: "lastLap", metricId: "lastLapTime", enabled: true, width: 60 },
  { id: "bestLap", metricId: "bestLapTime", enabled: true, width: 60 },
];

function makeStandingsColumnGroups(): ColumnGroupConfig[] {
  const colIds = [
    "position",
    "carNumber",
    "driver",
    "class",
    "gap",
    "lastLap",
    "bestLap",
  ];
  const makeColumns = (): ColumnConfig[] =>
    colIds.map((id) => {
      const src = STANDINGS_COLUMNS.find((c) => c.id === id)!;
      return { ...src };
    });

  return [
    { id: "hypercar", enabled: true, columns: makeColumns() },
    { id: "lmp2", enabled: true, columns: makeColumns() },
    { id: "lmgt3", enabled: false, columns: makeColumns() },
  ];
}

const RELATIVE_COLUMNS: ColumnConfig[] = [
  { id: "position", metricId: "pos", enabled: true, width: 24 },
  { id: "carNumber", metricId: "carNumber", enabled: true, width: 30 },
  { id: "driver", metricId: "driverName", enabled: true, width: 1 },
  { id: "gap", metricId: "gap", enabled: true, width: 60 },
  { id: "bestLap", metricId: "bestLapTime", enabled: true, width: 60 },
  { id: "lastLap", metricId: "lastLapTime", enabled: true, width: 60 },
];

const MULTICLASS_COLUMNS: ColumnConfig[] = [
  { id: "position", metricId: "pos", enabled: true, width: 24 },
  { id: "className", metricId: "className", enabled: true, width: 40 },
  { id: "driver", metricId: "driverName", enabled: true, width: 1 },
  { id: "gap", metricId: "gap", enabled: true, width: 60 },
];

const DEFAULTS: Record<string, WidgetDefaults> = {
  delta: {
    slots: [
      { id: "headerStat", metricId: "trackTemp", enabled: true },
      { id: "footerStat", metricId: "sessionTime", enabled: true },
      { id: "playerBadge", metricId: "driverClass", enabled: true },
    ],
    columns: [],
    columnGroups: [],
  },
  standings: {
    slots: [],
    columns: STANDINGS_COLUMNS.map((c) => ({ ...c })),
    columnGroups: makeStandingsColumnGroups(),
  },
  relative: {
    slots: [],
    columns: RELATIVE_COLUMNS.map((c) => ({ ...c })),
    columnGroups: [],
  },
  pedals: {
    slots: [
      { id: "throttle", metricId: "throttle", enabled: true },
      { id: "brake", metricId: "brake", enabled: true },
      { id: "clutch", metricId: "clutch", enabled: true },
    ],
    columns: [],
    columnGroups: [],
  },
  "broadcast-tower": {
    slots: [
      { id: "lapCounter", metricId: "currentLap", enabled: true },
      { id: "position1", metricId: "pos1", enabled: true },
      { id: "position2", metricId: "pos2", enabled: true },
      { id: "position3", metricId: "pos3", enabled: true },
      { id: "position4", metricId: "pos4", enabled: true },
    ],
    columns: [],
    columnGroups: [],
  },
  "multiclass-relative": {
    slots: [{ id: "classBadge", metricId: "className", enabled: true }],
    columns: MULTICLASS_COLUMNS.map((c) => ({ ...c })),
    columnGroups: [],
  },
};

const EMPTY_DEFAULTS: WidgetDefaults = {
  slots: [],
  columns: [],
  columnGroups: [],
};

function getDefaults(widgetType: string): WidgetDefaults {
  return DEFAULTS[widgetType] ?? EMPTY_DEFAULTS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildDefaultSlots(
  widgetType: string,
  _themeId: string | undefined, // eslint-disable-line @typescript-eslint/no-unused-vars
): SlotConfig[] {
  return getDefaults(widgetType).slots;
}

export function buildDefaultColumns(
  widgetType: string,
  _themeId: string | undefined, // eslint-disable-line @typescript-eslint/no-unused-vars
): ColumnConfig[] {
  return getDefaults(widgetType).columns;
}

export function buildDefaultColumnGroups(
  widgetType: string,
  _themeId: string | undefined, // eslint-disable-line @typescript-eslint/no-unused-vars
): ColumnGroupConfig[] {
  return getDefaults(widgetType).columnGroups;
}

export function filterMetricsForWidget(
  widgetType: string,
  metrics: MetricCatalogEntry[],
): MetricCatalogEntry[] {
  return metrics.filter((m) => m.compatibleWidgets.includes(widgetType));
}

export function normaliseWidgetVariantConfig(
  variant: Partial<WidgetVariantConfig>,
): WidgetVariantConfig {
  if (!variant.widgetType) {
    throw new Error("widgetType is required");
  }

  const defaults = getDefaults(variant.widgetType);

  return {
    id:
      variant.id ?? `variant-${variant.widgetType}-${Date.now()}`,
    widgetType: variant.widgetType,
    templateId: variant.templateId,
    themeId: variant.themeId,
    name: variant.name,
    slots: variant.slots ?? defaults.slots,
    columns: variant.columns ?? defaults.columns,
    columnGroups: variant.columnGroups ?? defaults.columnGroups,
    filters: variant.filters ?? {},
    formats: variant.formats ?? {},
    props: variant.props,
  };
}
