import { describe, expect, it } from "vitest";
import {
  parseTelemetryPayload,
  type TelemetryRefState,
} from "../../lib/telemetry-ref";
import { getCanonicalPreviewTelemetry } from "../widgets/widget-preview-fixtures";
import { generateAnimatedTelemetry } from "../widgets/mock-telemetry";
import {
  normalizeLegacyTelemetry,
  snapshotFromDisconnected,
  snapshotFromError,
} from "./telemetry-adapter";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

const CAPTURED_AT = 1_720_569_600_000;

describe("normalizeLegacyTelemetry", () => {
  it("maps qualifying session name to canonical qualifying type", () => {
    const ref: TelemetryRefState = {
      ...getCanonicalPreviewTelemetry(),
      sessionType: 2,
      sessionName: "QUALIFY1",
    };
    const snapshot = normalizeLegacyTelemetry(ref, CAPTURED_AT);
    expect(snapshot.session.type).toBe("qualifying");
    expect(snapshot.status).toBe("ready");
  });

  it("exposes standings and relative scoring rows without mutating source vehicles", () => {
    const ref = getCanonicalPreviewTelemetry();
    const snapshot = normalizeLegacyTelemetry(ref, CAPTURED_AT);
    const originalName = ref.vehicles[4]?.driverName;

    expect(snapshot.scoring.length).toBeGreaterThanOrEqual(20);
    expect(snapshot.scoring[4]).toMatchObject({
      driverName: "TOYOTA GAZOO",
      isPlayer: true,
      place: 5,
    });
    ref.vehicles[4].driverName = "MUTATED";
    expect(snapshot.scoring[4]?.driverName).toBe(originalName);
  });

  it("normalizes pedals to 0..1 for legacy percent inputs", () => {
    const ref: TelemetryRefState = {
      ...getCanonicalPreviewTelemetry(),
      throttle: 78,
      brake: 12,
      clutch: 0,
    };
    const snapshot = normalizeLegacyTelemetry(ref, CAPTURED_AT);
    expect(snapshot.player.throttle).toBeCloseTo(0.78, 3);
    expect(snapshot.player.brake).toBeCloseTo(0.12, 3);
    expect(snapshot.player.clutch).toBe(0);
  });

  it("normalizes live payload pedals and delta for delta/standings/relative/pedals consumers", () => {
    const payload = generateAnimatedTelemetry(1_500);
    const snapshot = normalizeLegacyTelemetry(payload, CAPTURED_AT);

    expect(snapshot.status).toBe("ready");
    expect(snapshot.session.type).toBe("race");
    expect(snapshot.scoring.length).toBeGreaterThan(0);
    expect(snapshot.player.throttle).toBeGreaterThanOrEqual(0);
    expect(snapshot.player.throttle).toBeLessThanOrEqual(1);
    expect(snapshot.player.deltaSeconds).toBeDefined();
    expect(parseTelemetryPayload(payload).snapshot.connected).toBe(true);
  });

  it("exposes additive live widget fields and preserves absent values", () => {
    const payload = {
      seq: 12,
      snapshot: {
        connected: true,
        sessionEpoch: 7,
        sessionKey: "race-7",
        player: {
          speed: 214.5,
          gear: 5,
          engineRPM: 8750,
          fuel: 42.3,
          throttle: 78,
          brake: 12,
          clutch: 0,
        },
        session: {
          trackName: "Le Mans",
          sessionName: "RACE",
          yellowFlagState: "GREEN",
          sectorFlags: ["GREEN", "YELLOW", "GREEN"],
        },
        vehicles: [{ id: 1, driverName: "Driver", totalLaps: 14, isPlayer: true }],
      },
    };
    const snapshot = normalizeLegacyTelemetry(payload, CAPTURED_AT);
    expect(snapshot.session).toMatchObject({
      key: "race-7",
      epoch: 7,
      trackName: "Le Mans",
      globalFlag: "GREEN",
      sectorFlags: ["GREEN", "YELLOW", "GREEN"],
    });
    expect(snapshot.player).toMatchObject({
      speedKph: 214.5,
      rpm: 8750,
      gear: 5,
      fuelLiters: 42.3,
      totalLaps: 14,
    });
    expect(snapshot.player.deltaSeconds).toBeUndefined();
  });

  it("returns explicit disconnected snapshot when legacy ref is offline", () => {
    const ref: TelemetryRefState = {
      ...getCanonicalPreviewTelemetry(),
      connected: false,
      vehicles: [],
    };
    const snapshot = normalizeLegacyTelemetry(ref, CAPTURED_AT);
    expect(snapshot).toEqual({
      status: "disconnected",
      capturedAt: CAPTURED_AT,
      session: { type: "race" },
      player: { inPit: false },
      scoring: [],
    } satisfies TelemetrySnapshot);
  });

  it("returns explicit error snapshot helpers", () => {
    expect(snapshotFromError(CAPTURED_AT, "parse failed")).toEqual({
      status: "error",
      capturedAt: CAPTURED_AT,
      session: { type: "race" },
      player: { inPit: false },
      scoring: [],
      errorMessage: "parse failed",
    });
    expect(snapshotFromDisconnected(CAPTURED_AT).status).toBe("disconnected");
  });
});
