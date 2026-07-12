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
  {
    id: 4,
    driverNumber: "5",
    driverName: "TOYOTA GAZOO",
    teamName: "TOYOTA GAZOO",
    vehicleClass: "HYPERCAR",
    place: 5,
    isPlayer: true,
    inPits: false,
    bestLapTime: 90.876,
    lastLapTime: 91.221,
    totalLaps: 14,
    estimatedLapTime: 164.659,
  },
  {
    id: 2,
    driverNumber: "3",
    driverName: "FERRARI AF",
    teamName: "FERRARI AF",
    vehicleClass: "HYPERCAR",
    place: 3,
    isPlayer: false,
    inPits: false,
    bestLapTime: 89.455,
    lastLapTime: 90.332,
  },
  {
    id: 7,
    driverNumber: "7",
    driverName: "PORSCHE PENSKE",
    teamName: "PORSCHE PENSKE",
    vehicleClass: "HYPERCAR",
    place: 1,
    isPlayer: false,
    inPits: false,
    bestLapTime: 89.004,
    lastLapTime: 89.641,
  },
  {
    id: 8,
    driverNumber: "8",
    driverName: "CADILLAC RACING",
    teamName: "CADILLAC RACING",
    vehicleClass: "HYPERCAR",
    place: 2,
    isPlayer: false,
    inPits: false,
    bestLapTime: 89.201,
    lastLapTime: 89.900,
  },
  {
    id: 11,
    driverNumber: "31",
    driverName: "BMW M TEAM",
    teamName: "BMW M TEAM",
    vehicleClass: "HYPERCAR",
    place: 6,
    isPlayer: false,
    inPits: false,
    bestLapTime: 91.102,
    lastLapTime: 91.502,
  },
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
    speedKph: 242,
    rpm: 8120,
    gear: 6,
    fuelLiters: 58.4,
    totalLaps: 14,
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
