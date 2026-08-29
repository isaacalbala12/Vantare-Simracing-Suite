import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "./mock-scenarios";
import { createTelemetryRateCoordinator } from "./telemetry-rate-coordinator";
import type { OverlayFrameV2 } from "../../generated/telemetry";

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

function performanceFrame(
  sequence: number,
  rafCap: number | null,
  widgetHz: Record<string, number | "dirty" | "event">,
  standings: readonly unknown[] = [],
  level: 1 | 2 | 3 | 4 | 5 = rafCap === null ? 1 : 3,
  phase = "race",
): OverlayFrameV2 {
  return {
    epoch: 1,
    sequence,
    player: { id: "" },
    standings,
    session: { phase: { v: phase, q: "fresh" }, flag: { q: "missing" } },
    capabilities: {
      performance: { level, mode: "manual", effects: "full", rafCap, widgetHz, sourceHz: 60 },
    },
  } as unknown as OverlayFrameV2;
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

  it("derives layout and visibility context exclusively from Overlay V2", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "qualifying", location: "pit" }));
    const frame = {
      ...performanceFrame(1, null, {}, [{ id: "player", pit: "track" }], 1, "race"),
      player: { id: "player" },
    } as OverlayFrameV2;
    coordinator.setOverlayFrame(frame, { state: "live" });

    expect(coordinator.getOverlayRuntimeContext()).toMatchObject({
      sourceState: "live",
      sessionType: "race",
      playerPresent: true,
      playerInPit: false,
      vehicleCount: 1,
    });
    coordinator.dispose();
  });

  it("keeps invalid V2 failures observable until a valid frame arrives", () => {
    const coordinator = createTelemetryRateCoordinator();
    const retained = performanceFrame(1, null, { "racing-flags": "event" });
    coordinator.setOverlayFrame(retained, { state: "live" }, 1, 1);
    coordinator.setOverlayFailure({ code: "invalid-frame", message: "invalid-contract:frame" });
    expect(coordinator.getOverlayFailure()).toEqual({
      code: "invalid-frame",
      message: "invalid-contract:frame",
    });
    coordinator.setOverlayFrame(retained, { state: "stale", reason: "watchdog" }, 1, 1);
    expect(coordinator.getOverlayFailure()).toEqual({
      code: "invalid-frame",
      message: "invalid-contract:frame",
    });
    coordinator.setOverlayFrame(performanceFrame(2, null, {}), { state: "live" }, 2, 2);
    expect(coordinator.getOverlayFailure()).toBeUndefined();
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

  it("applies the global rafCap published by Go", () => {
    const harness = controllableScheduler();
    let currentTime = 0;
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => currentTime });
    coordinator.setOverlayFrame(performanceFrame(1, 20, { pedals: 20 }));
    const listener = vi.fn();
    coordinator.subscribe("pedals", listener);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    currentTime = 49;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    currentTime = 50;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("never paints a widget faster than its widgetHz row", () => {
    const harness = controllableScheduler();
    let currentTime = 0;
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => currentTime });
    coordinator.setOverlayFrame(performanceFrame(1, 60, { delta: 10 }));
    const listener = vi.fn();
    coordinator.subscribe("delta", listener);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    currentTime = 99;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    currentTime = 100;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("keeps level 1 monitor widgets at the existing one-paint-per-frame behavior", () => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => 0 });
    coordinator.setOverlayFrame(performanceFrame(1, null, {}));
    const listener = vi.fn();
    coordinator.subscribe("pedals", listener);

    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("exempts event subscriptions from rafCap when their observable source changes", () => {
    const harness = controllableScheduler();
    let currentTime = 0;
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => currentTime });
    coordinator.setOverlayFrame(performanceFrame(1, 1, { "racing-flags": "event" }, [], 5));
    const listener = vi.fn();
    coordinator.subscribe("racing-flags", listener);

    currentTime = 1;
    coordinator.setOverlayFrame(performanceFrame(2, 1, { "racing-flags": "event" }, [], 5, "qualifying"));
    harness.tick();

    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it.each([
    ["stale source", () => ({ frame: performanceFrame(1, 1, { "racing-flags": "event" }, [], 5), source: { state: "stale" as const } })],
    ["invalid failure", () => ({ failure: { code: "invalid-frame" as const, message: "invalid" } })],
  ])("wakes event subscriptions for %s without a new frame sequence", (_label, change) => {
    const harness = controllableScheduler();
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => 1 });
    const frame = performanceFrame(1, 1, { "racing-flags": "event" }, [], 5);
    coordinator.setOverlayFrame(frame, { state: "live" }, 1, 1);
    const listener = vi.fn();
    coordinator.subscribe("racing-flags", listener);

    const next = change();
    if ("failure" in next) coordinator.setOverlayFailure(next.failure);
    else coordinator.setOverlayFrame(next.frame, next.source, 1, 1);
    harness.tick();

    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("uses frame.sequence and a one-second ceiling for dirty widgets", () => {
    const harness = controllableScheduler();
    let currentTime = 0;
    const coordinator = createTelemetryRateCoordinator({ createScheduler: harness.create, now: () => currentTime });
    coordinator.setOverlayFrame(performanceFrame(1, 40, { standings: "dirty" }, [{ id: "car-1" }]));
    const listener = vi.fn();
    coordinator.subscribe("standings", listener);

    coordinator.setOverlayFrame(performanceFrame(2, 40, { standings: "dirty" }, [{ id: "car-1" }]));
    currentTime = 500;
    harness.tick();
    expect(listener).not.toHaveBeenCalled();
    coordinator.setOverlayFrame(performanceFrame(3, 40, { standings: "dirty" }, [{ id: "car-1" }]));
    currentTime = 1_000;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    currentTime = 2_000;
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.setOverlayFrame(performanceFrame(4, 40, { standings: "dirty" }, [{ id: "car-1" }]));
    harness.tick();
    expect(listener).toHaveBeenCalledTimes(2);
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
