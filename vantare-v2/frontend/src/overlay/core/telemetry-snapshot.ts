export type TelemetrySnapshot = {
  status: "ready" | "missing" | "stale" | "disconnected" | "error";
  capturedAt: number;
  session: {
    type: "practice" | "qualifying" | "race" | "warmup" | "endurance";
    remainingSeconds?: number;
  };
  player: {
    inPit: boolean;
    deltaSeconds?: number;
    lastLapSeconds?: number;
    bestLapSeconds?: number;
    throttle?: number;
    brake?: number;
    clutch?: number;
  };
  scoring: readonly Record<string, unknown>[];
  errorMessage?: string;
};