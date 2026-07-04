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
// Built-in metric catalog for editors
// ---------------------------------------------------------------------------

export const BUILTIN_METRICS: MetricCatalogEntry[] = [
  { id: "pos", label: "Posición", compatibleWidgets: ["standings", "relative", "multiclass-relative"] },
  { id: "carNumber", label: "Número", compatibleWidgets: ["standings", "relative"] },
  { id: "driverName", label: "Piloto", compatibleWidgets: ["standings", "relative", "multiclass-relative"] },
  { id: "className", label: "Clase", compatibleWidgets: ["standings", "relative", "multiclass-relative"] },
  { id: "gap", label: "Gap", compatibleWidgets: ["standings", "relative", "multiclass-relative"] },
  { id: "gapAhead", label: "Gap adelante", compatibleWidgets: ["relative"] },
  { id: "gapBehind", label: "Gap atrás", compatibleWidgets: ["relative"] },
  { id: "lastLapTime", label: "Última vuelta", compatibleWidgets: ["standings", "relative"] },
  { id: "bestLapTime", label: "Mejor vuelta", compatibleWidgets: ["standings", "relative"] },
  { id: "trackTemp", label: "Temp. pista", compatibleWidgets: ["delta"] },
  { id: "sessionTime", label: "Tiempo sesión", compatibleWidgets: ["delta"] },
  { id: "driverClass", label: "Clase piloto", compatibleWidgets: ["delta"] },
  { id: "throttle", label: "Acelerador", compatibleWidgets: ["pedals"] },
  { id: "brake", label: "Freno", compatibleWidgets: ["pedals"] },
  { id: "clutch", label: "Embrague", compatibleWidgets: ["pedals"] },
  { id: "currentLap", label: "Vuelta actual", compatibleWidgets: ["broadcast-tower"] },
  { id: "pos1", label: "Pos 1", compatibleWidgets: ["broadcast-tower"] },
  { id: "pos2", label: "Pos 2", compatibleWidgets: ["broadcast-tower"] },
  { id: "pos3", label: "Pos 3", compatibleWidgets: ["broadcast-tower"] },
  { id: "pos4", label: "Pos 4", compatibleWidgets: ["broadcast-tower"] },
];


export function getMetricLabel(metricId: string): string {
  return BUILTIN_METRICS.find((m) => m.id === metricId)?.label ?? metricId;
}

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
// ---------------------------------------------------------------------------
// Editing helpers (MC-1)
// ---------------------------------------------------------------------------

export type WidthPreset = "xs" | "sm" | "md" | "lg" | "auto";

export function toggleSlotEnabled(
  slots: SlotConfig[],
  slotId: string,
): SlotConfig[] {
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1) return slots;
  return slots.map((s, i) => (i === idx ? { ...s, enabled: !s.enabled } : s));
}

export function updateSlotConfig(
  slots: SlotConfig[],
  slotId: string,
  updates: { metricId?: string; label?: string; format?: Record<string, unknown> },
): SlotConfig[] {
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1) return slots;
  return slots.map((s, i) => {
    if (i !== idx) return s;
    const next = { ...s };
    if (updates.metricId !== undefined) next.metricId = updates.metricId;
    if (updates.label !== undefined) {
      next.style = { ...next.style, label: updates.label };
    }
    if (updates.format !== undefined) next.format = updates.format;
    return next;
  });
}

export function toggleColumnEnabled(
  columns: ColumnConfig[],
  columnId: string,
): ColumnConfig[] {
  const idx = columns.findIndex((c) => c.id === columnId);
  if (idx === -1) return columns;
  return columns.map((c, i) => (i === idx ? { ...c, enabled: !c.enabled } : c));
}

export function updateColumnConfig(
  columns: ColumnConfig[],
  columnId: string,
  updates: {
    metricId?: string;
    widthPreset?: WidthPreset;
    format?: Record<string, unknown>;
  },
): ColumnConfig[] {
  const idx = columns.findIndex((c) => c.id === columnId);
  if (idx === -1) return columns;
  return columns.map((c, i) => {
    if (i !== idx) return c;
    const next = { ...c };
    if (updates.metricId !== undefined) next.metricId = updates.metricId;
    if (updates.widthPreset !== undefined) next.widthPreset = updates.widthPreset;
    if (updates.format !== undefined) next.format = updates.format;
    return next;
  });
}

export function toggleColumnGroupEnabled(
  groups: ColumnGroupConfig[],
  groupId: string,
): ColumnGroupConfig[] {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return groups;
  return groups.map((g, i) => (i === idx ? { ...g, enabled: !g.enabled } : g));
}
// ---------------------------------------------------------------------------
// Effective config resolution (MC-2)
// ---------------------------------------------------------------------------

export type EffectiveWidgetConfig = {
  slots: SlotConfig[];
  columns: ColumnConfig[];
  columnGroups: ColumnGroupConfig[];
  themeId?: string;
};

export function resolveEffectiveWidgetVariant(
  widget: { variantId?: string; type: string; style?: string; props?: Record<string, unknown> },
  profile: { variants?: WidgetVariantConfig[] },
): EffectiveWidgetConfig {
  // 1. If widget has a variantId, use that variant
  if (widget.variantId) {
    const variant = profile.variants?.find((v) => v.id === widget.variantId);
    if (variant) {
      return {
        slots: variant.slots ?? getDefaults(widget.type).slots,
        columns: variant.columns ?? getDefaults(widget.type).columns,
        columnGroups: variant.columnGroups ?? getDefaults(widget.type).columnGroups,
        themeId: variant.themeId,
      };
    }
  }

  // 2. If widget.props has slots/columns/columnGroups, use those
  const propsSlots = widget.props?.slots as SlotConfig[] | undefined;
  const propsColumns = widget.props?.columns as ColumnConfig[] | undefined;
  const propsColumnGroups = widget.props?.columnGroups as ColumnGroupConfig[] | undefined;

  const defaults = getDefaults(widget.type);

  return {
    slots: propsSlots ?? defaults.slots,
    columns: propsColumns ?? defaults.columns,
    columnGroups: propsColumnGroups ?? defaults.columnGroups,
    themeId: widget.style,
  };
}
