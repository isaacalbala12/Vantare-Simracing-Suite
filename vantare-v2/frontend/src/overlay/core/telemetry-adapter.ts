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

// El mensaje es opcional a proposito. errorMessage viaja hasta statusMessage en
// una decena de view models y los renderers lo pintan tal cual, asi que solo
// debe llevar texto legible por una persona. Sin mensaje el widget se queda en
// su estado vacio, que es lo correcto para un overlay en emision.
export function snapshotFromError(capturedAt: number, message?: string): TelemetrySnapshot {
  const snapshot: TelemetrySnapshot = {
    status: "error",
    capturedAt,
    session: { type: "race" },
    player: { inPit: false },
    scoring: [],
  };
  if (message !== undefined) snapshot.errorMessage = message;
  return snapshot;
}

export function snapshotFromStale(base: TelemetrySnapshot, capturedAt: number): TelemetrySnapshot {
  return {
    ...base,
    status: "stale",
    capturedAt,
  };
}
