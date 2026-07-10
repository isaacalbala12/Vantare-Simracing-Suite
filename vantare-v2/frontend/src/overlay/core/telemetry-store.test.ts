import { describe, expect, it, vi } from "vitest";
import { createTelemetryStore } from "./telemetry-store";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

const initialSnapshot: TelemetrySnapshot = {
  status: "ready",
  capturedAt: 1_720_569_600_000,
  session: { type: "race", remainingSeconds: 3600 },
  player: { inPit: false, deltaSeconds: -0.15 },
  scoring: [],
};

describe("createTelemetryStore", () => {
  it("notifies subscribers once per publish", () => {
    const store = createTelemetryStore(initialSnapshot);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const nextSnapshot: TelemetrySnapshot = {
      ...initialSnapshot,
      player: { inPit: false, deltaSeconds: 0.38 },
    };
    store.publish(nextSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual(nextSnapshot);

    unsubscribe();
    store.publish({
      ...nextSnapshot,
      status: "stale",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns immutable snapshot copies", () => {
    const store = createTelemetryStore(initialSnapshot);
    const first = store.getSnapshot();
    first.player.deltaSeconds = 9.99;
    expect(store.getSnapshot().player.deltaSeconds).toBe(-0.15);
  });
});