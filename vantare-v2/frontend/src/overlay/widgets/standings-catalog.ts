import type { ColumnConfig } from "../../lib/profile";

export type StandingsReleaseChannel = "stable" | "tester" | "later";

export type StandingsMetricId =
  | "position"
  | "driverNumber"
  | "driverName"
  | "vehicleClass"
  | "currentLap"
  | "gap"
  | "interval"
  | "bestLap"
  | "lastLap"
  | "playerHighlight"
  | "pitInfo"
  | "distance"
  | "deltaLapTime";

export type StandingsColumnId =
  | "position"
  | "driverNumber"
  | "driverName"
  | "vehicleClass"
  | "currentLap"
  | "gap"
  | "interval"
  | "bestLap"
  | "lastLap";

export interface StandingsMetricDefinition {
  id: StandingsMetricId;
  label: string;
  sourceField: string;
  releaseChannel: StandingsReleaseChannel;
  requiresLive?: boolean;
}

export interface StandingsColumnDefinition {
  id: StandingsColumnId;
  metricId: StandingsMetricId;
  label: string;
  defaultEnabled: boolean;
  defaultWidth: number;
  releaseChannel: StandingsReleaseChannel;
  format?: ColumnConfig["format"];
  style?: ColumnConfig["style"];
}

export const STANDINGS_METRICS: StandingsMetricDefinition[] = [
  {
    id: "position",
    label: "Posición",
    sourceField: "place",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "driverNumber",
    label: "Número",
    sourceField: "driverNumber",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "driverName",
    label: "Piloto",
    sourceField: "driverName",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "vehicleClass",
    label: "Clase",
    sourceField: "vehicleClass",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "currentLap",
    label: "Vuelta",
    sourceField: "totalLaps",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "gap",
    label: "Gap",
    sourceField: "timeBehindLeader",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "interval",
    label: "Intervalo",
    sourceField: "timeBehindNext",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "bestLap",
    label: "Mejor vuelta",
    sourceField: "bestLapTime",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "lastLap",
    label: "Última vuelta",
    sourceField: "lastLapTime",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "playerHighlight",
    label: "Jugador",
    sourceField: "isPlayer",
    releaseChannel: "stable",
    requiresLive: false,
  },
  {
    id: "pitInfo",
    label: "Pit",
    sourceField: "pitState",
    releaseChannel: "tester",
    requiresLive: false,
  },
  {
    id: "distance",
    label: "Distancia",
    sourceField: "lapDistance",
    releaseChannel: "tester",
    requiresLive: false,
  },
  {
    id: "deltaLapTime",
    label: "Delta",
    sourceField: "timeBehindNext",
    releaseChannel: "tester",
    requiresLive: false,
  },
];

export const STANDINGS_COLUMNS: StandingsColumnDefinition[] = [
  {
    id: "position",
    metricId: "position",
    label: "Posición",
    defaultEnabled: true,
    defaultWidth: 28,
    releaseChannel: "stable",
  },
  {
    id: "driverNumber",
    metricId: "driverNumber",
    label: "Número",
    defaultEnabled: true,
    defaultWidth: 42,
    releaseChannel: "stable",
  },
  {
    id: "driverName",
    metricId: "driverName",
    label: "Piloto",
    defaultEnabled: true,
    defaultWidth: 132,
    releaseChannel: "stable",
    format: { mode: "full", maxChars: 16 },
    style: { align: "left" },
  },
  {
    id: "gap",
    metricId: "gap",
    label: "Gap",
    defaultEnabled: true,
    defaultWidth: 70,
    releaseChannel: "stable",
    style: { align: "right" },
  },
  {
    id: "vehicleClass",
    metricId: "vehicleClass",
    label: "Clase",
    defaultEnabled: false,
    defaultWidth: 64,
    releaseChannel: "stable",
  },
  {
    id: "currentLap",
    metricId: "currentLap",
    label: "Vuelta",
    defaultEnabled: false,
    defaultWidth: 52,
    releaseChannel: "stable",
    style: { align: "right" },
  },
  {
    id: "interval",
    metricId: "interval",
    label: "Intervalo",
    defaultEnabled: false,
    defaultWidth: 70,
    releaseChannel: "stable",
    style: { align: "right" },
  },
  {
    id: "bestLap",
    metricId: "bestLap",
    label: "Mejor vuelta",
    defaultEnabled: false,
    defaultWidth: 76,
    releaseChannel: "stable",
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
  {
    id: "lastLap",
    metricId: "lastLap",
    label: "Última vuelta",
    defaultEnabled: false,
    defaultWidth: 76,
    releaseChannel: "stable",
    format: { display: "full", decimals: 3 },
    style: { align: "right" },
  },
];

export function getStandingsMetric(id: string): StandingsMetricDefinition | undefined {
  return STANDINGS_METRICS.find((metric) => metric.id === id);
}

export function getStandingsColumn(id: string): StandingsColumnDefinition | undefined {
  return STANDINGS_COLUMNS.find((column) => column.id === id);
}

export function createDefaultStandingsColumns(): ColumnConfig[] {
  return STANDINGS_COLUMNS.map((column) => {
    const config: ColumnConfig = {
      id: column.id,
      metricId: column.metricId,
      enabled: column.defaultEnabled,
      width: column.defaultWidth,
    };
    if (column.format) {
      config.format = { ...column.format };
    }
    if (column.style) {
      config.style = { ...column.style };
    }
    return config;
  });
}
