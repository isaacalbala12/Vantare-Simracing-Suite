import type {
  DerivedDeltaSample,
  DerivedFuelLap,
  DerivedInputSample,
} from "./derived-telemetry-store";

export type TelemetrySnapshot = {
  status: "ready" | "missing" | "stale" | "disconnected" | "error";
  capturedAt: number;
  session: {
    type: "practice" | "qualifying" | "race" | "warmup" | "endurance";
    remainingSeconds?: number;
    key?: string;
    epoch?: number;
    trackName?: string;
    globalFlag?: string;
    sectorFlags?: readonly string[];
  };
  player: {
    inPit: boolean;
    speedKph?: number;
    rpm?: number;
    gear?: number;
    fuelLiters?: number;
    totalLaps?: number;
    deltaSeconds?: number;
    lastLapSeconds?: number;
    bestLapSeconds?: number;
    lapNumber?: number;
    predictedLapSeconds?: number;
    throttle?: number;
    brake?: number;
    clutch?: number;
  };
  scoring: readonly Record<string, unknown>[];
  derived?: {
    fuelHistory: readonly DerivedFuelLap[];
    inputHistory: readonly DerivedInputSample[];
    deltaHistory: readonly DerivedDeltaSample[];
  };
  errorMessage?: string;
};
