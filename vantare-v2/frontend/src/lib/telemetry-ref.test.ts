import { describe, expect, it, beforeEach } from "vitest";
import {
  applyTelemetryUpdate,
  getTelemetryRef,
  parseTelemetryPayload,
  resetTelemetryRefForTests,
} from "./telemetry-ref";

describe("telemetry-ref", () => {
  beforeEach(() => {
    resetTelemetryRefForTests();
  });

  it("parses camelCase snapshot from Go wire format", () => {
    const payload = parseTelemetryPayload({
      seq: 1,
      snapshot: {
        connected: true,
        player: { speed: 15, gear: 4, engineRPM: 7200, fuel: 45.2 },
      },
    });
    applyTelemetryUpdate(payload);
    const t = getTelemetryRef();
    expect(t.speed).toBe(15);
    expect(t.gear).toBe(4);
    expect(t.rpm).toBe(7200);
  });

  it("parses JSON string payloads", () => {
    const raw = JSON.stringify({
      seq: 2,
      snapshot: {
        connected: true,
        player: { speed: 20, gear: 3, engineRPM: 5000 },
      },
    });
    applyTelemetryUpdate(parseTelemetryPayload(raw));
    expect(getTelemetryRef().speed).toBe(20);
  });

  it("merges diff player fields", () => {
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 1,
        snapshot: { connected: true, player: { speed: 10, gear: 2, engineRPM: 3000 } },
      }),
    );
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 2,
        snapshot: { connected: true },
        diff: { t: Date.now(), d: { player: { speed: 25, gear: 5 } } },
      }),
    );
    const t = getTelemetryRef();
    expect(t.speed).toBe(25);
    expect(t.gear).toBe(5);
  });

  it("tracks vehicles from snapshot", () => {
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 1,
        snapshot: {
          connected: true,
          player: { speed: 10, gear: 2, engineRPM: 3000 },
          vehicles: [
            { id: 1, driverName: "Player", place: 1, isPlayer: true },
            { id: 2, driverName: "AI1", place: 2, timeBehindLeader: 1.5 },
          ],
        },
      }),
    );
    const t = getTelemetryRef();
    expect(t.vehicles).toHaveLength(2);
    expect(t.vehicles[0].driverName).toBe("Player");
    expect(t.vehicles[1].timeBehindLeader).toBe(1.5);
  });

  it("replaces vehicles via diff", () => {
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 1,
        snapshot: {
          connected: true,
          player: { speed: 10, gear: 2, engineRPM: 3000 },
          vehicles: [{ id: 1, driverName: "Old" }],
        },
      }),
    );
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 2,
        snapshot: { connected: true },
        diff: {
          t: Date.now(),
          d: { vehicles: [{ id: 1, driverName: "New" }, { id: 2, driverName: "AI" }] },
        },
      }),
    );
    const t = getTelemetryRef();
    expect(t.vehicles).toHaveLength(2);
    expect(t.vehicles[0].driverName).toBe("New");
  });

  it("tracks deltaBest from snapshot and diff", () => {
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 1,
        snapshot: {
          connected: true,
          player: { speed: 10, gear: 2, engineRPM: 3000, deltaBest: 0.5 },
        },
      }),
    );
    expect(getTelemetryRef().deltaBest).toBe(0.5);

    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 2,
        snapshot: { connected: true },
        diff: { t: Date.now(), d: { player: { deltaBest: -0.2 } } },
      }),
    );
    expect(getTelemetryRef().deltaBest).toBe(-0.2);
  });

  it("tracks trackName from session", () => {
    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 1,
        snapshot: {
          connected: true,
          player: { speed: 10, gear: 2, engineRPM: 3000 },
          session: { trackName: "Spa" },
        },
      }),
    );
    expect(getTelemetryRef().trackName).toBe("Spa");

    applyTelemetryUpdate(
      parseTelemetryPayload({
        seq: 2,
        snapshot: { connected: true },
        diff: { t: Date.now(), d: { session: { trackName: "Monza" } } },
      }),
    );
    expect(getTelemetryRef().trackName).toBe("Monza");
  });
});
