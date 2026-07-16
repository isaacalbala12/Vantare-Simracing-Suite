import { describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";

describe("Overlay Studio V3 performance contracts", () => {
  it("bounds notifications by shared Hz buckets instead of widget count", () => {
    const ticks = new Map<number, () => void>();
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: (hz) => ({
        start(onTick) {
          ticks.set(hz, onTick);
        },
        stop() {
          ticks.delete(hz);
        },
      }),
    });
    const slowListeners = Array.from({ length: 20 }, () => vi.fn());
    const fastListener = vi.fn();
    slowListeners.forEach((listener) => coordinator.subscribe(15, listener));
    coordinator.subscribe(30, fastListener);

    for (let index = 0; index < 120; index += 1) {
      coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    }
    for (let index = 0; index < 15; index += 1) ticks.get(15)?.();
    for (let index = 0; index < 30; index += 1) ticks.get(30)?.();

    expect(slowListeners.every((listener) => listener.mock.calls.length === 15)).toBe(true);
    expect(fastListener).toHaveBeenCalledTimes(30);
    expect(ticks.size).toBe(2);
    coordinator.dispose();
    expect(ticks.size).toBe(0);
  });

  it("isolates a subscriber updateHz change and cleans the old bucket", () => {
    const stops = new Map<number, number>();
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: (hz) => ({
        start() {},
        stop() {
          stops.set(hz, (stops.get(hz) ?? 0) + 1);
        },
      }),
    });
    const oldListener = vi.fn();
    const newListener = vi.fn();
    const unsubscribeOld = coordinator.subscribe(15, oldListener);
    coordinator.subscribe(30, newListener);
    unsubscribeOld();

    expect(stops.get(15)).toBe(1);
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).not.toHaveBeenCalled();
    coordinator.dispose();
  });
});
