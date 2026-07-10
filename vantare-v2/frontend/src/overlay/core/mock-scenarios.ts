import type { TelemetrySnapshot } from "./telemetry-snapshot";

export type MockSessionScenario = "practice" | "qualifying" | "race";
export type MockLocationScenario = "track" | "pits";
export type MockDataState = "ready" | "stale" | "disconnected" | "error";

const MOCK_CAPTURED_AT = 1_720_569_600_000;

const SESSION_REMAINING_SECONDS: Record<MockSessionScenario, number> = {
  practice: 5328,
  qualifying: 900,
  race: 3600,
};

const CANONICAL_SCORING: readonly Record<string, unknown>[] = [
  { id: 4, driverName: "TOYOTA GAZOO", place: 5, isPlayer: true, inPits: false, bestLapTime: 90.876, lastLapTime: 91.221 },
  { id: 2, driverName: "FERRARI AF", place: 3, isPlayer: false, inPits: false, bestLapTime: 89.455, lastLapTime: 90.332 },
];

function buildReadyPlayer(location: MockLocationScenario) {
  return {
    inPit: location === "pits",
    deltaSeconds: -0.15,
    lastLapSeconds: 91.221,
    bestLapSeconds: 90.876,
    throttle: 0.78,
    brake: 0.12,
    clutch: 0,
  };
}

export function buildMockTelemetry(input: {
  session: MockSessionScenario;
  location: MockLocationScenario;
  state?: MockDataState;
}): TelemetrySnapshot {
  const state = input.state ?? "ready";
  const base: TelemetrySnapshot = {
    status: state === "ready" ? "ready" : state,
    capturedAt: MOCK_CAPTURED_AT,
    session: {
      type: input.session,
      remainingSeconds: SESSION_REMAINING_SECONDS[input.session],
    },
    player: buildReadyPlayer(input.location),
    scoring: CANONICAL_SCORING.map((entry) => ({ ...entry })),
  };

  if (state === "disconnected") {
    return {
      ...base,
      status: "disconnected",
      player: { inPit: false },
      scoring: [],
    };
  }

  if (state === "error") {
    return {
      ...base,
      status: "error",
      errorMessage: "mock telemetry error",
      player: { inPit: false },
      scoring: [],
    };
  }

  if (state === "stale") {
    return {
      ...base,
      status: "stale",
    };
  }

  return base;
}