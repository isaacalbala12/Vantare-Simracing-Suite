import { describe, expect, it } from "vitest";
import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { createDerivedTelemetryStore } from "./derived-telemetry-store";

function snapshot(input: {
  sessionKey?: string;
  epoch?: number;
  status?: TelemetrySnapshot["status"];
  lap?: number;
  fuel?: number;
  delta?: number;
  throttle?: number;
}): TelemetrySnapshot {
  return {
    status: input.status ?? "ready",
    capturedAt: (input.lap ?? 0) * 1_000 + (input.epoch ?? 0),
    session: { type: "race", key: input.sessionKey, epoch: input.epoch },
    player: {
      inPit: false,
      totalLaps: input.lap,
      fuelLiters: input.fuel,
      deltaSeconds: input.delta,
      throttle: input.throttle,
      brake: 0.2,
      clutch: 0,
    },
    scoring: [],
  };
}

describe("createDerivedTelemetryStore", () => {
  it("bounds input and delta histories to 120 immutable samples", () => {
    const store = createDerivedTelemetryStore();
    for (let index = 0; index < 140; index += 1) {
      store.publish(snapshot({ sessionKey: "race-a", epoch: 1, delta: index / 100, throttle: index / 140 }));
    }

    const inputs = store.getInputHistory();
    const deltas = store.getDeltaHistory();
    expect(inputs).toHaveLength(120);
    expect(deltas).toHaveLength(120);
    expect(inputs[0]?.throttle).toBeCloseTo(20 / 140);
    expect(deltas[0]?.deltaSeconds).toBeCloseTo(0.2);
    expect(Object.isFrozen(inputs)).toBe(true);
    expect(Object.isFrozen(inputs[0])).toBe(true);
  });

  it("records positive lap fuel consumption and ignores refuels", () => {
    const store = createDerivedTelemetryStore();
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, lap: 4, fuel: 60 }));
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, lap: 5, fuel: 57.2 }));
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, lap: 6, fuel: 70 }));
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, lap: 7, fuel: 67.1 }));

    expect(store.getFuelHistory()).toEqual([
      { lap: 5, consumedLiters: 2.8 },
      { lap: 7, consumedLiters: 2.9 },
    ]);
  });

  it("resets on session identity changes and disconnected snapshots", () => {
    const store = createDerivedTelemetryStore();
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, delta: -0.1 }));
    store.publish(snapshot({ sessionKey: "race-b", epoch: 2, delta: -0.2 }));
    expect(store.getDeltaHistory()).toHaveLength(1);

    store.publish(snapshot({ sessionKey: "race-b", epoch: 2, status: "disconnected", delta: -0.3 }));
    expect(store.getDeltaHistory()).toEqual([]);
    expect(store.getInputHistory()).toEqual([]);
  });

  it("clears all data on dispose without timers or later mutation", () => {
    const store = createDerivedTelemetryStore();
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, delta: 0.1 }));
    store.dispose();
    store.publish(snapshot({ sessionKey: "race-a", epoch: 1, delta: 0.2 }));
    expect(store.getDeltaHistory()).toEqual([]);
  });
});
