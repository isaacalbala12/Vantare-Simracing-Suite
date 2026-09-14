import { describe, expect, it, vi } from "vitest";
import { buildAuthoringV2ScenarioRuntime } from "../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
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
    listeners.forEach((listener) => coordinator.subscribe(undefined, listener));
    coordinator.subscribe(undefined, vi.fn());

    const runtime = buildAuthoringV2ScenarioRuntime({
      session: "race",
      location: "track",
      state: "ready",
      widget: "delta",
      system: "vantare-endurance",
      variant: "default",
    });
    if (!runtime.overlayV2Frame) throw new Error("golden V2 frame missing");

    for (let index = 0; index < 120; index += 1) {
      coordinator.setOverlayFrame(
        { ...runtime.overlayV2Frame, sequence: index + 1 },
        runtime.overlayV2Source,
      );
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
    const unsubscribeOld = coordinator.subscribe(undefined, oldListener);
    coordinator.subscribe(undefined, newListener);
    unsubscribeOld();

    expect(stops).toBe(0);
    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).not.toHaveBeenCalled();
    coordinator.dispose();
    expect(stops).toBe(1);
  });
});
