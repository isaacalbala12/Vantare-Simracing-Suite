import { describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";

describe("Overlay Studio V3 performance contracts", () => {
  // Since ISA-372 / F11 the cadence is regulated in Go, before projecting and
  // serializing. The frontend bounds work by repaint, not by Hz buckets.
  it("bounds notifications by repaint, not by widget count", () => {
    let frame: (() => void) | null = null;
    let started = 0;
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: () => ({
        start(onFrame) {
          started += 1;
          frame = onFrame;
        },
        stop() {
          frame = null;
        },
      }),
    });
    const listeners = Array.from({ length: 20 }, () => vi.fn());
    listeners.forEach((listener) => coordinator.subscribe(15, listener));
    coordinator.subscribe(30, vi.fn());

    for (let index = 0; index < 120; index += 1) {
      coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    }
    frame?.();

    // 120 snapshots collapse into a single repaint for every subscriber, and
    // 21 subscribers share one loop.
    expect(listeners.every((listener) => listener.mock.calls.length === 1)).toBe(true);
    expect(started).toBe(1);
    coordinator.dispose();
    expect(frame).toBeNull();
  });

  it("keeps the repaint loop alive while any subscriber remains", () => {
    let stops = 0;
    const coordinator = createTelemetryRateCoordinator({
      createScheduler: () => ({
        start() {},
        stop() {
          stops += 1;
        },
      }),
    });
    const oldListener = vi.fn();
    const newListener = vi.fn();
    const unsubscribeOld = coordinator.subscribe(15, oldListener);
    coordinator.subscribe(30, newListener);
    unsubscribeOld();

    expect(stops).toBe(0);
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).not.toHaveBeenCalled();
    coordinator.dispose();
    expect(stops).toBe(1);
  });
});
