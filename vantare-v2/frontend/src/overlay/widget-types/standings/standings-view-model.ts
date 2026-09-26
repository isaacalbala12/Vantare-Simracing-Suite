import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { WidgetColumnV3 } from "../shared/widget-column";
import type { StandingsClassScope, StandingsClassificationMode } from "./standings-content";

export type StandingsRowViewModel = {
  id: string;
  position: number;
  classPosition?: number;
  /** Explicit same-session starting-grid position. Absent means no delta authority. */
  gridPosition?: number;
  /** Session/epoch identity that authorised gridPosition. */
  gridSessionIdentity?: string;
  driverNumber: string;
  driverName: string;
  configuredDriverName?: string;
  vehicleClass: string;
  teamCode: string;
  teamBrandColor: string;
  /** Optional, source-authorised manufacturer identity; never inferred from a driver name. */
  manufacturer?: string;
  gapText: string;
  intervalText: string;
  currentLapText: string;
  lastLapText: string;
  bestLapText: string;
  /** Fresh numeric authority for lap events; absent values never trigger motion. */
  bestLapSeconds?: number;
  /** Fresh race gap to the common leader; absent for pits, lapped or invalid rows. */
  battleGapSeconds?: number;
  pitText: string;
  tireCompound: string;
  isPlayer: boolean;
  isLeader: boolean;
};

export type StandingsFlag = "unknown" | "green" | "yellow" | "blue" | "red" | "white" | "black" | "checkered";
export type StandingsInfoMetric = "trackTemperature" | "airTemperature" | "estimatedLaps" | "totalLaps" | "track" | "remaining" | "rain" | "wetness";
export type StandingsInfoValue = { text: string; stale?: boolean };

export type StandingsViewModel = WidgetViewModelBase & {
  type: "standings";
  /** Content scope used by the shared renderer; absent on legacy V1 models. */
  classScope?: StandingsClassScope;
  /** Classification used by the shared renderer; independent from visual style. */
  classificationMode?: StandingsClassificationMode;
  activeClass: string;
  sessionLabel: string;
  remainingText: string;
  lapText?: string;
  /** Player data before presentation clipping. */
  playerRow?: StandingsRowViewModel;
  trackName?: string;
  totalRows?: number;
  /** Fastest fresh lap over the full configured field, before row/window limits. */
  sessionBest?: { rowId: string; seconds: number };
  /** Datos ambientales opcionales para la banda inferior; solo existen cuando
   *  la fuente V2 los entrega con calidad actual. */
  ambientTempText?: string;
  trackTempText?: string;
  windText?: string;
  flag?: StandingsFlag;
  sessionInfo?: Readonly<Record<StandingsInfoMetric, StandingsInfoValue>>;
  columns: readonly WidgetColumnV3[];
  rows: readonly StandingsRowViewModel[];
  /** Productive stream identity used only to discard ephemeral motion state. */
  motionIdentity?: string;
  motionSequence?: number;
};

export function withStandingsMotionIdentity(
  model: StandingsViewModel,
  identity: string,
  sequence: number,
): StandingsViewModel {
  Object.defineProperties(model, {
    motionIdentity: { value: identity, enumerable: false },
    motionSequence: { value: sequence, enumerable: false },
  });
  return model;
}

/**
 * Keeps the scope available to the renderer without changing the enumerable
 * V1 projection consumed by existing shadow/comparator tests.
 */
export function withStandingsClassScope(
  model: StandingsViewModel,
  classScope: StandingsClassScope,
): StandingsViewModel {
  Object.defineProperty(model, "classScope", {
    value: classScope,
    configurable: true,
    enumerable: false,
  });
  return model;
}

/**
 * Keeps the classification available to renderers without changing the
 * enumerable legacy projection consumed by shadow/comparator tests.
 */
export function withStandingsClassificationMode(
  model: StandingsViewModel,
  classificationMode: StandingsClassificationMode,
): StandingsViewModel {
  Object.defineProperty(model, "classificationMode", {
    value: classificationMode,
    configurable: true,
    enumerable: false,
  });
  return model;
}

export function resolveStandingsCellValue(
  row: StandingsRowViewModel,
  metricId: string,
): string {
  switch (metricId) {
    case "position":
      return String(row.position);
    case "driverNumber":
      return row.driverNumber;
    case "driverName":
      return row.configuredDriverName ?? row.driverName;
    case "vehicleClass":
      return row.vehicleClass;
    case "gap":
      return row.gapText;
    case "interval":
      return row.intervalText;
    case "currentLap":
      return row.currentLapText;
    case "lastLap":
      return row.lastLapText;
    case "bestLap":
      return row.bestLapText;
    case "pit":
      return row.pitText;
    case "tireCompound":
      return row.tireCompound;
    default:
      return "—";
  }
}
