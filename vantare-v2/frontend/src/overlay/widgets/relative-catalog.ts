import type { ColumnConfig } from "../../lib/profile";

export const RELATIVE_DEFAULT_TEMPLATE_ID = "relative-vantare-default";

export type RelativeMetricId =
  | "position"
  | "class"
  | "carNumber"
  | "driverName"
  | "gap"
  | "bestLap"
  | "lastLap";

export type RelativeColumnId = RelativeMetricId;

export type RelativeReleaseChannel = "stable" | "tester" | "dev";
export type RelativeReliability = "available" | "experimental" | "unavailable";
export type RelativeMockSupport = "realistic" | "placeholder" | "mockOnly";

export type RelativeMetricDefinition = {
  id: RelativeMetricId;
  label: string;
  sourceField: string;
  widgets: ["relative"];
  columns: RelativeColumnId[];
  defaultFallback: string;
  releaseChannel: RelativeReleaseChannel;
  reliability: RelativeReliability;
  mockSupport: RelativeMockSupport;
  requiresLive: boolean;
};

export type RelativeColumnDefinition = {
  id: RelativeColumnId;
  label: string;
  metricId: RelativeMetricId;
  defaultEnabled: boolean;
  defaultWidth: number;
  semanticRole: RelativeMetricId;
  align: "left" | "center" | "right";
};

export type RelativeTemplateDefinition = {
  id: string;
  label: string;
  columns: RelativeColumnDefinition[];
};

export const RELATIVE_METRICS: RelativeMetricDefinition[] = [
  {
    id: "position",
    label: "Posición",
    sourceField: "place",
    widgets: ["relative"],
    columns: ["position"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "class",
    label: "Clase",
    sourceField: "vehicleClass",
    widgets: ["relative"],
    columns: ["class"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "carNumber",
    label: "Número",
    sourceField: "driverNumber",
    widgets: ["relative"],
    columns: ["carNumber"],
    defaultFallback: "",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "driverName",
    label: "Piloto",
    sourceField: "driverName",
    widgets: ["relative"],
    columns: ["driverName"],
    defaultFallback: "?",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "gap",
    label: "Gap",
    sourceField: "timeGapToPlayer",
    widgets: ["relative"],
    columns: ["gap"],
    defaultFallback: "—",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "bestLap",
    label: "Mejor vuelta",
    sourceField: "bestLapTime",
    widgets: ["relative"],
    columns: ["bestLap"],
    defaultFallback: "-",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
  {
    id: "lastLap",
    label: "Última vuelta",
    sourceField: "lastLapTime",
    widgets: ["relative"],
    columns: ["lastLap"],
    defaultFallback: "-",
    releaseChannel: "stable",
    reliability: "available",
    mockSupport: "realistic",
    requiresLive: false,
  },
];

export const RELATIVE_COLUMNS: RelativeColumnDefinition[] = [
  { id: "position", label: "Posición", metricId: "position", defaultEnabled: true, defaultWidth: 24, semanticRole: "position", align: "center" },
  { id: "class", label: "Clase", metricId: "class", defaultEnabled: true, defaultWidth: 6, semanticRole: "class", align: "center" },
  { id: "carNumber", label: "Número", metricId: "carNumber", defaultEnabled: true, defaultWidth: 28, semanticRole: "carNumber", align: "center" },
  { id: "driverName", label: "Piloto", metricId: "driverName", defaultEnabled: true, defaultWidth: 120, semanticRole: "driverName", align: "left" },
  { id: "gap", label: "Gap", metricId: "gap", defaultEnabled: true, defaultWidth: 48, semanticRole: "gap", align: "right" },
  { id: "bestLap", label: "Mejor vuelta", metricId: "bestLap", defaultEnabled: false, defaultWidth: 62, semanticRole: "bestLap", align: "right" },
  { id: "lastLap", label: "Última vuelta", metricId: "lastLap", defaultEnabled: false, defaultWidth: 62, semanticRole: "lastLap", align: "right" },
];

export const RELATIVE_TEMPLATES: RelativeTemplateDefinition[] = [
  {
    id: RELATIVE_DEFAULT_TEMPLATE_ID,
    label: "Vantare Relative",
    columns: RELATIVE_COLUMNS,
  },
];

export function getRelativeMetric(id: string): RelativeMetricDefinition | undefined {
  return RELATIVE_METRICS.find((metric) => metric.id === id);
}

export function getRelativeColumn(id: string): RelativeColumnDefinition | undefined {
  return RELATIVE_COLUMNS.find((column) => column.id === id);
}

export function getRelativeTemplate(id: string): RelativeTemplateDefinition {
  return RELATIVE_TEMPLATES.find((template) => template.id === id) ?? RELATIVE_TEMPLATES[0];
}

export function createDefaultRelativeColumns(): ColumnConfig[] {
  return RELATIVE_COLUMNS.map((column) => {
    const config: ColumnConfig = {
      id: column.id,
      metricId: column.metricId,
      enabled: column.defaultEnabled,
      width: column.defaultWidth,
      style: { align: column.align },
    };
    if (column.id === "driverName") {
      config.format = { mode: "full", maxChars: 18 };
    }
    if (column.id === "bestLap" || column.id === "lastLap") {
      config.format = { display: "full", decimals: 3 };
    }
    return config;
  });
}
