export type VehicleScoring = {
  id: number;
  driverName?: string;
  driverNumber?: string;
  teamName?: string;
  vehicleName?: string;
  place?: number;
  totalLaps?: number;
  vehicleClass?: string;
  isPlayer?: boolean;
  inPits?: boolean;
  pitting?: boolean;
  inGarageStall?: boolean;
  pitState?: string;
  sector?: string;
  finishStatus?: string;
  timeBehindLeader?: number;
  timeBehindNext?: number;
  lapsBehindLeader?: number;
  lapsBehindClassLeader?: number;
  lapsBehindNext?: number;
  lapDistance?: number;
  timeIntoLap?: number;
  bestLapTime?: number;
  lastLapTime?: number;
  estimatedLapTime?: number;
  pitstops?: number;
  penalties?: number;
  qualification?: number;
  flag?: string;
  fuelFraction?: number;
  teamBrandColor?: string;
  tireCompound?: string;
  fastestLap?: boolean;
  timeGapToPlayer?: number;
};

export type PlayerDiff = {
  speed?: number;
  rpm?: number;
  gear?: number;
  fuel?: number;
  deltaBest?: number;
  throttle?: number;
  brake?: number;
  clutch?: number;
};

export type SessionDiff = {
  trackName?: string;
  sessionType?: number;
  sessionName?: string;
  sessionTime?: number;
  numVehicles?: number;
  gamePhase?: number;
};

export type SessionState = "offline" | "menu" | "garage" | "session" | "";

export type SessionMode = "practice" | "qualifying" | "race";

export function resolveSessionMode(sessionType?: number, sessionName?: string): SessionMode {
  const name = (sessionName ?? "").toUpperCase();
  if (name.startsWith("PRACTICE") || name.startsWith("TEST")) return "practice";
  if (name.startsWith("QUALIFY")) return "qualifying";
  if (name.startsWith("RACE") || name.startsWith("WARMUP")) return "race";

  switch (sessionType) {
    case 1:
    case 10:
      return "practice";
    case 2:
      return "qualifying";
    case 3:
    case 11:
      return "race";
    case 4:
      return "race";
    default:
      return "race";
  }
}

export type TelemetryPayload = {
  seq: number;
  snapshot: {
    connected: boolean;
    playerHasVehicle?: boolean;
    sessionEpoch?: number;
    sessionKey?: string;
    sessionState?: SessionState;
    player?: {
      speed: number;
      gear: number;
      engineRPM: number;
      fuel?: number;
      deltaBest?: number;
      throttle?: number;
      brake?: number;
      clutch?: number;
    };
  session?: {
    trackName?: string;
    sessionName?: string;
    sessionTime?: number;
    timeRemainingInGamePhase?: number;
    numVehicles?: number;
    gamePhase?: number;
    playerName?: string;
    yellowFlagState?: string;
    sectorFlags?: string[];
  };
  vehicles?: VehicleScoring[];

  };
  diff?: {
    t: number;
    d: Record<string, unknown>;
  };
};

export type TelemetryRefState = {
  seq: number;
  connected: boolean;
  playerHasVehicle: boolean;
  sessionEpoch: number;
  sessionKey: string;
  sessionState: SessionState;
  sessionType?: number;
  sessionName?: string;
  speed: number;
  gear: number;
  rpm: number;
  fuel: number;
  deltaBest: number;
  trackName: string;
  throttle: number;
  brake: number;
  clutch: number;
  vehicles: VehicleScoring[];
};

const state: TelemetryRefState = {
  seq: 0,
  connected: false,
  playerHasVehicle: false,
  sessionEpoch: 0,
  sessionKey: "",
  sessionState: "",
  sessionType: undefined,
  sessionName: "",
  speed: 0,
  gear: 0,
  rpm: 0,
  fuel: 0,
  deltaBest: 0,
  trackName: "",
  throttle: 0,
  brake: 0,
  clutch: 0,
  vehicles: [],
};

export function getTelemetryRef(): TelemetryRefState {
  return state;
}

export function parseTelemetryPayload(data: unknown): TelemetryPayload {
  if (typeof data === "string") {
    return JSON.parse(data) as TelemetryPayload;
  }
  if (data && typeof data === "object") {
    return data as TelemetryPayload;
  }
  throw new Error("invalid telemetry payload");
}

export function applyTelemetryUpdate(payload: TelemetryPayload) {
  const nextEpoch = payload.snapshot.sessionEpoch ?? state.sessionEpoch;
  const epochChanged = state.sessionEpoch !== 0 && nextEpoch !== state.sessionEpoch;
  if (epochChanged) {
    clearRuntimeTelemetry();
  }

  state.seq = payload.seq;
  state.connected = payload.snapshot.connected;
  state.playerHasVehicle = payload.snapshot.playerHasVehicle ?? state.playerHasVehicle;
  state.sessionEpoch = nextEpoch;
  state.sessionKey = payload.snapshot.sessionKey ?? state.sessionKey;
  state.sessionState = payload.snapshot.sessionState ?? state.sessionState;

  if (!state.connected) {
    clearRuntimeTelemetry();
    state.connected = false;
    state.sessionEpoch = nextEpoch;
    state.sessionKey = payload.snapshot.sessionKey ?? state.sessionKey;
    state.sessionState = payload.snapshot.sessionState ?? "offline";
  }

  const p = payload.snapshot?.player;
  if (p) {
    state.speed = p.speed;
    state.gear = p.gear;
    state.rpm = p.engineRPM;
    if (p.fuel != null) state.fuel = p.fuel;
    if (p.deltaBest != null) state.deltaBest = p.deltaBest;
  if (p.throttle != null) state.throttle = normalizeInputToPercent(p.throttle);
  if (p.brake != null) state.brake = normalizeInputToPercent(p.brake);
    if (p.clutch != null) state.clutch = normalizeInputToPercent(p.clutch);
  }

  const s = payload.snapshot?.session;
  if (s) {
    if (s.trackName != null) state.trackName = s.trackName;
    if (s.sessionType != null) state.sessionType = s.sessionType;
    if (s.sessionName != null) state.sessionName = s.sessionName;
  }

  if (payload.snapshot?.vehicles) {
    state.vehicles = payload.snapshot.vehicles;
  }

  // Apply diff overrides (vehicles are full replacement, not merged)
  const d = payload.diff?.d;
  if (d) {
    if (typeof d.sessionEpoch === "number" && d.sessionEpoch !== state.sessionEpoch) {
      clearRuntimeTelemetry();
      state.sessionEpoch = d.sessionEpoch;
    }
    if (typeof d.sessionKey === "string") state.sessionKey = d.sessionKey;
    if (typeof d.sessionState === "string") state.sessionState = d.sessionState as SessionState;

    const pd = d.player as PlayerDiff | undefined;
    if (pd) {
      if (pd.speed != null) state.speed = pd.speed;
      if (pd.rpm != null) state.rpm = pd.rpm;
      if (pd.gear != null) state.gear = pd.gear;
      if (pd.fuel != null) state.fuel = pd.fuel;
      if (pd.deltaBest != null) state.deltaBest = pd.deltaBest;
    if (pd.throttle != null) state.throttle = normalizeInputToPercent(pd.throttle);
    if (pd.brake != null) state.brake = normalizeInputToPercent(pd.brake);
      if (pd.clutch != null) state.clutch = normalizeInputToPercent(pd.clutch);
    }
    const sd = d.session as SessionDiff | undefined;
    if (sd) {
      if (sd.trackName != null) state.trackName = sd.trackName;
      if (sd.sessionType != null) state.sessionType = sd.sessionType;
      if (sd.sessionName != null) state.sessionName = sd.sessionName;
    }
    if (typeof d.playerHasVehicle === "boolean") state.playerHasVehicle = d.playerHasVehicle;
    if (d.vehicles && Array.isArray(d.vehicles)) {
      state.vehicles = d.vehicles as VehicleScoring[];
    }
  }
}

/** @internal test helper */
export function resetTelemetryRefForTests() {
  state.seq = 0;
  state.connected = false;
  state.playerHasVehicle = false;
  state.sessionEpoch = 0;
  state.sessionKey = "";
  state.sessionState = "";
  clearRuntimeTelemetry();
}

function clearRuntimeTelemetry() {
  state.speed = 0;
  state.gear = 0;
  state.rpm = 0;
  state.fuel = 0;
  state.deltaBest = 0;
  state.trackName = "";
  state.throttle = 0;
  state.brake = 0;
  state.clutch = 0;
  state.vehicles = [];
}

function normalizeInputToPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Live sims send 0..1; HTML gauges expect 0..100. If already >1, assume percent.
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}
