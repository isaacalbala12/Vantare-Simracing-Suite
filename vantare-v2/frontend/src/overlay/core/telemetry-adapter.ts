import {
  parseTelemetryPayload,
  resolveSessionMode,
  type TelemetryPayload,
  type TelemetryRefState,
  type VehicleScoring,
} from "../../lib/telemetry-ref";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

function isTelemetryRefState(input: unknown): input is TelemetryRefState {
  if (!input || typeof input !== "object") {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  return "vehicles" in candidate && "connected" in candidate && !("snapshot" in candidate);
}

function normalizePedalInput(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return Math.max(0, Math.min(1, value));
}

function mapSessionType(
  sessionType?: number,
  sessionName?: string,
): TelemetrySnapshot["session"]["type"] {
  const mode = resolveSessionMode(sessionType, sessionName);
  switch (mode) {
    case "qual":
      return "qualifying";
    case "practice":
      return "practice";
    case "warmup":
      return "warmup";
    case "race":
    default:
      return "race";
  }
}

function cloneScoring(vehicles: readonly VehicleScoring[]): Record<string, unknown>[] {
  return vehicles.map((entry) => ({ ...entry }));
}

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

function snapshotFromRef(ref: TelemetryRefState, capturedAt: number): TelemetrySnapshot {
  if (!ref.connected) {
    return buildDisconnectedSnapshot(capturedAt);
  }

  const playerVehicle = ref.vehicles.find((vehicle) => vehicle.isPlayer);
  return {
    status: "ready",
    capturedAt,
    session: {
      type: mapSessionType(ref.sessionType, ref.sessionName),
      remainingSeconds: ref.timeRemaining,
    },
    player: {
      inPit: playerVehicle?.inPits ?? false,
      deltaSeconds: ref.deltaBest,
      lastLapSeconds: playerVehicle?.lastLapTime,
      bestLapSeconds: playerVehicle?.bestLapTime,
      throttle: normalizePedalInput(ref.throttle),
      brake: normalizePedalInput(ref.brake),
      clutch: normalizePedalInput(ref.clutch),
    },
    scoring: cloneScoring(ref.vehicles),
  };
}

function buildRefFromPayload(payload: TelemetryPayload): TelemetryRefState {
  const snapshot = payload.snapshot;
  const state: TelemetryRefState = {
    seq: payload.seq ?? 0,
    connected: snapshot?.connected ?? false,
    playerHasVehicle: snapshot?.playerHasVehicle ?? false,
    sessionEpoch: snapshot?.sessionEpoch ?? 0,
    sessionKey: snapshot?.sessionKey ?? "",
    sessionState: snapshot?.sessionState ?? "offline",
    sessionType: snapshot?.session?.sessionType,
    sessionName: snapshot?.session?.sessionName ?? "",
    speed: snapshot?.player?.speed ?? 0,
    gear: snapshot?.player?.gear ?? 0,
    rpm: snapshot?.player?.engineRPM ?? 0,
    fuel: snapshot?.player?.fuel ?? 0,
    deltaBest: snapshot?.player?.deltaBest ?? 0,
    trackName: snapshot?.session?.trackName ?? "",
    throttle: normalizePedalInput(snapshot?.player?.throttle) ?? 0,
    brake: normalizePedalInput(snapshot?.player?.brake) ?? 0,
    clutch: normalizePedalInput(snapshot?.player?.clutch) ?? 0,
    timeRemaining: snapshot?.session?.timeRemainingInGamePhase ?? 0,
    vehicles: snapshot?.vehicles ? [...snapshot.vehicles] : [],
  };

  const diff = payload.diff?.d;
  if (diff) {
    const playerDiff = diff.player as Record<string, unknown> | undefined;
    if (playerDiff) {
      if (typeof playerDiff.speed === "number") state.speed = playerDiff.speed;
      if (typeof playerDiff.rpm === "number") state.rpm = playerDiff.rpm;
      if (typeof playerDiff.gear === "number") state.gear = playerDiff.gear;
      if (typeof playerDiff.fuel === "number") state.fuel = playerDiff.fuel;
      if (typeof playerDiff.deltaBest === "number") state.deltaBest = playerDiff.deltaBest;
      if (typeof playerDiff.throttle === "number") {
        state.throttle = normalizePedalInput(playerDiff.throttle) ?? state.throttle;
      }
      if (typeof playerDiff.brake === "number") {
        state.brake = normalizePedalInput(playerDiff.brake) ?? state.brake;
      }
      if (typeof playerDiff.clutch === "number") {
        state.clutch = normalizePedalInput(playerDiff.clutch) ?? state.clutch;
      }
    }
    const sessionDiff = diff.session as Record<string, unknown> | undefined;
    if (sessionDiff) {
      if (typeof sessionDiff.trackName === "string") state.trackName = sessionDiff.trackName;
      if (typeof sessionDiff.sessionType === "number") state.sessionType = sessionDiff.sessionType;
      if (typeof sessionDiff.sessionName === "string") state.sessionName = sessionDiff.sessionName;
      if (typeof sessionDiff.timeRemainingInGamePhase === "number") {
        state.timeRemaining = sessionDiff.timeRemainingInGamePhase;
      }
    }
    if (Array.isArray(diff.vehicles)) {
      state.vehicles = diff.vehicles as VehicleScoring[];
    }
  }

  return state;
}

export function normalizeLegacyTelemetry(input: unknown, capturedAt: number): TelemetrySnapshot {
  if (isTelemetryRefState(input)) {
    return snapshotFromRef(input, capturedAt);
  }

  const payload = parseTelemetryPayload(input);
  return snapshotFromRef(buildRefFromPayload(payload), capturedAt);
}