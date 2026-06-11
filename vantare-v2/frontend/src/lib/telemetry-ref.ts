export type VehicleScoring = {
  id: number;
  driverName?: string;
  place?: number;
  totalLaps?: number;
  vehicleClass?: string;
  isPlayer?: boolean;
  inPits?: boolean;
  timeBehindLeader?: number;
};

export type PlayerDiff = {
  speed?: number;
  rpm?: number;
  gear?: number;
  fuel?: number;
  deltaBest?: number;
};

export type SessionDiff = {
  trackName?: string;
  sessionTime?: number;
  numVehicles?: number;
  gamePhase?: number;
};

export type TelemetryPayload = {
  seq: number;
  snapshot: {
    connected: boolean;
    player?: {
      speed: number;
      gear: number;
      engineRPM: number;
      fuel?: number;
      deltaBest?: number;
    };
    session?: {
      trackName?: string;
      sessionTime?: number;
      numVehicles?: number;
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
  speed: number;
  gear: number;
  rpm: number;
  fuel: number;
  deltaBest: number;
  trackName: string;
  vehicles: VehicleScoring[];
};

const state: TelemetryRefState = {
  seq: 0,
  connected: false,
  speed: 0,
  gear: 0,
  rpm: 0,
  fuel: 0,
  deltaBest: 0,
  trackName: "",
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
  state.seq = payload.seq;
  state.connected = payload.snapshot.connected;

  const p = payload.snapshot?.player;
  if (p) {
    state.speed = p.speed;
    state.gear = p.gear;
    state.rpm = p.engineRPM;
    if (p.fuel != null) state.fuel = p.fuel;
    if (p.deltaBest != null) state.deltaBest = p.deltaBest;
  }

  const s = payload.snapshot?.session;
  if (s) {
    if (s.trackName != null) state.trackName = s.trackName;
  }

  if (payload.snapshot?.vehicles) {
    state.vehicles = payload.snapshot.vehicles;
  }

  // Apply diff overrides (vehicles are full replacement, not merged)
  const d = payload.diff?.d;
  if (d) {
    const pd = d.player as PlayerDiff | undefined;
    if (pd) {
      if (pd.speed != null) state.speed = pd.speed;
      if (pd.rpm != null) state.rpm = pd.rpm;
      if (pd.gear != null) state.gear = pd.gear;
      if (pd.fuel != null) state.fuel = pd.fuel;
      if (pd.deltaBest != null) state.deltaBest = pd.deltaBest;
    }
    const sd = d.session as SessionDiff | undefined;
    if (sd) {
      if (sd.trackName != null) state.trackName = sd.trackName;
    }
    if (d.vehicles && Array.isArray(d.vehicles)) {
      state.vehicles = d.vehicles as VehicleScoring[];
    }
  }
}

/** @internal test helper */
export function resetTelemetryRefForTests() {
  state.seq = 0;
  state.connected = false;
  state.speed = 0;
  state.gear = 0;
  state.rpm = 0;
  state.fuel = 0;
  state.deltaBest = 0;
  state.trackName = "";
  state.vehicles = [];
}
