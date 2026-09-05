import type { WidgetViewModelBase } from "../../core/widget-definition";
import type { WidgetColumnV3 } from "../shared/widget-column";

export type StandingsRowViewModel = {
  id: string;
  position: number;
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
  gapText: string;
  intervalText: string;
  currentLapText: string;
  lastLapText: string;
  bestLapText: string;
  pitText: string;
  tireCompound: string;
  isPlayer: boolean;
  isLeader: boolean;
};

export type StandingsViewModel = WidgetViewModelBase & {
  type: "standings";
  activeClass: string;
  sessionLabel: string;
  remainingText: string;
  lapText?: string;
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
      return row.driverName;
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
