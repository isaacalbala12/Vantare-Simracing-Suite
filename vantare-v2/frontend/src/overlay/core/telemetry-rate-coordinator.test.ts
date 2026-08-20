import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";
import { createTelemetryRateCoordinator } from "./telemetry-rate-coordinator";

function controllableScheduler() {
  let frame: (() => void) | null = null;
  let starts = 0;
  let stops = 0;
  return {
    starts: () => starts,
    stops: () => stops,
    tick: () => frame?.(),
    create: () => ({
      start(onFrame: () => void) {
        starts += 1;
        frame = onFrame;
      },
      stop() {
        stops += 1;
        frame = null;
      },
    }),
  };
}

describe("createTelemetryRateCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with a literal disconnected snapshot without mock data", () => {
    const coordinator = createTelemetryRateCoordinator();

    expect(coordinator.getSnapshot()).toEqual({
      status: "disconnected",
      capturedAt: 0,
      session: { type: "race" },
      player: { inPit: false },
      scoring: [],
    });
    expect(JSON.stringify(coordinator.getSnapshot())).not.toMatch(
      /TOYOTA|Spa|TestDriver|test@example\.com|mock-user/i,
    );
    coordinator.dispose();
  });

  it("shares a single repaint loop for every subscriber whatever the requested hz", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });
    const first = vi.fn();
    const second = vi.fn();
    coordinator.subscribe(15, first);
    coordinator.subscribe(30, second);

    expect(harness.starts()).toBe(1);
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    expect(first).not.toHaveBeenCalled();
    harness.tick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    coordinator.dispose();
  });

  it("does not regulate: the frequency argument no longer creates buckets", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });
    const slow = vi.fn();
    const fast = vi.fn();
    coordinator.subscribe(1, slow);
    coordinator.subscribe(240, fast);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();

    expect(slow).toHaveBeenCalledTimes(2);
    expect(fast).toHaveBeenCalledTimes(2);
    expect(harness.starts()).toBe(1);
    coordinator.dispose();
  });

  it("repaints once per frame however many snapshots arrived", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });
    const listener = vi.fn();
    coordinator.subscribe(60, listener);

    for (let index = 0; index < 5; index += 1) {
      coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    }
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);

    // A frame with nothing new does not wake the subscribers.
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("treats every status the same: no snapshot is special-cased any more", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });
    const listener = vi.fn();
    coordinator.subscribe(15, listener);

    coordinator.publish(
      buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }),
    );
    expect(listener).not.toHaveBeenCalled();
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().status).toBe("disconnected");
    coordinator.dispose();
  });

  it("returns the latest published snapshot from getSnapshot", () => {
    const coordinator = createTelemetryRateCoordinator();
    const ready = buildMockTelemetry({ session: "qualifying", location: "track" });
    coordinator.publish(ready);
    expect(coordinator.getSnapshot().session.type).toBe("qualifying");
    coordinator.dispose();
  });

  it("publishes bounded derived histories once per incoming snapshot", () => {
    const coordinator = createTelemetryRateCoordinator();
    const first = buildMockTelemetry({ session: "race", location: "track" });
    coordinator.publish({
      ...first,
      session: { ...first.session, key: "race-a", epoch: 1 },
      player: { ...first.player, totalLaps: 4, fuelLiters: 60, deltaSeconds: -0.1 },
    });
    coordinator.publish({
      ...first,
      capturedAt: first.capturedAt + 1_000,
      session: { ...first.session, key: "race-a", epoch: 1 },
      player: { ...first.player, totalLaps: 5, fuelLiters: 57.2, deltaSeconds: -0.2 },
    });

    const latest = coordinator.getSnapshot();
    expect(latest.derived?.fuelHistory).toEqual([{ lap: 5, consumedLiters: 2.8 }]);
    expect(latest.derived?.deltaHistory).toHaveLength(2);
    expect(latest.derived?.inputHistory).toHaveLength(2);
    coordinator.dispose();
  });

  it("stops the repaint loop after the last subscriber unsubscribes", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create });

    const unsubscribe = coordinator.subscribe(15, () => undefined);
    const other = coordinator.subscribe(15, () => undefined);
    unsubscribe();
    expect(harness.stops()).toBe(0);
    other();
    expect(harness.stops()).toBe(1);
    coordinator.dispose();
  });
});
