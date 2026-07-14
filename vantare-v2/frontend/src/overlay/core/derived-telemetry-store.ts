import type { TelemetrySnapshot } from "./telemetry-snapshot";

export type DerivedInputSample = Readonly<{
  capturedAt: number;
  throttle?: number;
  brake?: number;
  clutch?: number;
}>;

export type DerivedDeltaSample = Readonly<{
  capturedAt: number;
  deltaSeconds: number;
}>;

export type DerivedFuelLap = Readonly<{
  lap: number;
  consumedLiters: number;
}>;

export type DerivedTelemetryStore = {
  publish(snapshot: TelemetrySnapshot): void;
  getFuelHistory(): readonly DerivedFuelLap[];
  getInputHistory(): readonly DerivedInputSample[];
  getDeltaHistory(): readonly DerivedDeltaSample[];
  reset(sessionKey?: string): void;
  dispose(): void;
};

const INPUT_LIMIT = 120;
const DELTA_LIMIT = 120;
const FUEL_LIMIT = 64;

function boundedPush<T>(values: T[], value: T, limit: number): void {
  values.push(value);
  if (values.length > limit) {
    values.splice(0, values.length - limit);
  }
}

function frozenCopy<T extends object>(values: readonly T[]): readonly Readonly<T>[] {
  return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sessionIdentity(snapshot: TelemetrySnapshot): string | undefined {
  if (snapshot.session.key === undefined && snapshot.session.epoch === undefined) {
    return undefined;
  }
  return `${snapshot.session.key ?? ""}:${snapshot.session.epoch ?? ""}`;
}

export function createDerivedTelemetryStore(): DerivedTelemetryStore {
  const fuelHistory: DerivedFuelLap[] = [];
  const inputHistory: DerivedInputSample[] = [];
  const deltaHistory: DerivedDeltaSample[] = [];
  let identity: string | undefined;
  let previousLap: number | undefined;
  let previousFuel: number | undefined;
  let disposed = false;

  const reset = (nextIdentity?: string): void => {
    fuelHistory.length = 0;
    inputHistory.length = 0;
    deltaHistory.length = 0;
    previousLap = undefined;
    previousFuel = undefined;
    identity = nextIdentity;
  };

  return {
    publish(snapshot) {
      if (disposed) {
        return;
      }

      const nextIdentity = sessionIdentity(snapshot);
      if (identity !== undefined && nextIdentity !== undefined && identity !== nextIdentity) {
        reset(nextIdentity);
      } else if (identity === undefined && nextIdentity !== undefined) {
        identity = nextIdentity;
      }

      if (snapshot.status === "disconnected") {
        reset(nextIdentity);
        return;
      }
      if (snapshot.status !== "ready") {
        return;
      }

      const { throttle, brake, clutch, deltaSeconds, totalLaps, fuelLiters } = snapshot.player;
      if (finite(throttle) || finite(brake) || finite(clutch)) {
        boundedPush(
          inputHistory,
          Object.freeze({ capturedAt: snapshot.capturedAt, throttle, brake, clutch }),
          INPUT_LIMIT,
        );
      }
      if (finite(deltaSeconds)) {
        boundedPush(
          deltaHistory,
          Object.freeze({ capturedAt: snapshot.capturedAt, deltaSeconds }),
          DELTA_LIMIT,
        );
      }

      if (finite(totalLaps) && finite(fuelLiters)) {
        if (
          finite(previousLap)
          && finite(previousFuel)
          && totalLaps > previousLap
          && previousFuel > fuelLiters
          && !snapshot.player.inPit
        ) {
          boundedPush(
            fuelHistory,
            Object.freeze({
              lap: totalLaps,
              consumedLiters: Math.round((previousFuel - fuelLiters) * 1_000) / 1_000,
            }),
            FUEL_LIMIT,
          );
        }
        previousLap = totalLaps;
        previousFuel = fuelLiters;
      }
    },
    getFuelHistory: () => frozenCopy(fuelHistory) as readonly DerivedFuelLap[],
    getInputHistory: () => frozenCopy(inputHistory) as readonly DerivedInputSample[],
    getDeltaHistory: () => frozenCopy(deltaHistory) as readonly DerivedDeltaSample[],
    reset,
    dispose() {
      reset();
      disposed = true;
    },
  };
}
