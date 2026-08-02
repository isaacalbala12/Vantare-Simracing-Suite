import type { TelemetrySnapshot } from "./telemetry-snapshot";

function buildDisconnectedSnapshot(capturedAt: number): TelemetrySnapshot {
  return {
    status: "disconnected",
    capturedAt,
    session: { type: "race" },
    player: { inPit: false },
    scoring: [],
  };
}

export function snapshotFromDisconnected(capturedAt: number): TelemetrySnapshot {
  return buildDisconnectedSnapshot(capturedAt);
}

export function snapshotFromError(capturedAt: number, message: string): TelemetrySnapshot {
  return {
    status: "error",
    capturedAt,
    session: { type: "race" },
    player: { inPit: false },
    scoring: [],
    errorMessage: message,
  };
}

export function snapshotFromStale(base: TelemetrySnapshot, capturedAt: number): TelemetrySnapshot {
  return {
    ...base,
    status: "stale",
    capturedAt,
  };
}
