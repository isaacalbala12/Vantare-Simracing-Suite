import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";
import { createTelemetryRateCoordinator } from "./telemetry-rate-coordinator";

describe("createTelemetryRateCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one scheduler for the same hz bucket", () => {
    let tick: (() => void) | null = null;
    const createScheduler = vi.fn(() => ({
      start(onTick: () => void) {
        tick = onTick;
      },
      stop() {
        tick = null;
      },
    }));

    const coordinator = createTelemetryRateCoordinator({
      createScheduler,
      now: () => 1_000,
    });
    const first = vi.fn();
    const second = vi.fn();
    coordinator.subscribe(15, first);
    coordinator.subscribe(15, second);

    expect(createScheduler).toHaveBeenCalledTimes(1);
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    expect(first).not.toHaveBeenCalled();
    tick?.();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    coordinator.dispose();
  });

  it("creates independent schedulers for distinct hz buckets", () => {
    const created: number[] = [];
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: (hz) => {
        created.push(hz);
        return {
          start() {},
          stop() {},
        };
      },
      now: () => 1_000,
    });

    coordinator.subscribe(15, () => undefined);
    coordinator.subscribe(30, () => undefined);
    expect(created).toEqual([15, 30]);
    coordinator.dispose();
  });

  it("notifies every bucket immediately for stale/disconnected/error snapshots", () => {
    const coordinator = createTelemetryRateCoordinator({ now: () => 1_000 });
    const slow = vi.fn();
    const fast = vi.fn();
    coordinator.subscribe(15, slow);
    coordinator.subscribe(30, fast);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }));
    expect(slow).toHaveBeenCalledTimes(1);
    expect(fast).toHaveBeenCalledTimes(1);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "error" }));
    expect(slow).toHaveBeenCalledTimes(2);
    expect(fast).toHaveBeenCalledTimes(2);
  });

  it("returns the latest published snapshot from getSnapshot", () => {
    const coordinator = createTelemetryRateCoordinator({ now: () => 1_000 });
    const ready = buildMockTelemetry({ session: "qualifying", location: "track" });
    coordinator.publish(ready);
    expect(coordinator.getSnapshot(15).session.type).toBe("qualifying");
    coordinator.dispose();
  });

  it("removes schedulers after the last subscriber unsubscribes", () => {
    const stops: Array<() => void> = [];
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: () => ({
        start() {},
        stop: () => {
          stops.push(() => undefined);
        },
      }),
      now: () => 1_000,
    });

    const unsubscribe = coordinator.subscribe(15, () => undefined);
    unsubscribe();
    expect(stops).toHaveLength(1);
    coordinator.dispose();
  });
});