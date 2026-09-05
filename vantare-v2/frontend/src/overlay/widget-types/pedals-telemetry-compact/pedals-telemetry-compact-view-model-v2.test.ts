import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildPedalsTelemetryCompactViewModelV2 } from "./pedals-telemetry-compact-view-model-v2";
import {
  formatPedalsTelemetryGear,
  formatPedalsTelemetryRpm,
  formatPedalsTelemetrySpeed,
} from "../pedals-telemetry/pedals-telemetry-view-model";

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`),
      "utf8",
    ),
  ) as OverlayUpdateV2;
}

function goldenFrame(): OverlayFrameV2 {
  const update = golden(20);
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

function syntheticFrame(overrides: Partial<OverlayFrameV2["player"]> = {}): OverlayFrameV2 {
  const base = goldenFrame();
  return { ...base, player: { ...base.player, ...overrides } };
}

describe("pedals-telemetry-compact v2 view model", () => {
  it("construye modelo completo desde frame v2 (usa mismos instrumentos que pedals-telemetry)", () => {
    const frame = goldenFrame();
    const model = buildPedalsTelemetryCompactViewModelV2(frame, { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    expect(model.status).toBe("ready");
    expect(model.throttle).toBeCloseTo(0.75, 9);
    expect(model.brake).toBeCloseTo(0.125, 9);
    // speed mps 50 -> 180 kph
    expect(model.speedKph).toBeCloseTo(180, 9);
    expect(model.rpm).toBe(7200);
    expect(model.gear).toBe(4);
    expect(model.speedText).toBe("180");
    expect(model.rpmText).toBe("7.2k");
    expect(model.gearText).toBe("4");
  });

  it("placeholders cuando faltan señales", () => {
    const frame = syntheticFrame({
      speed: { q: "missing" },
      rpm: { q: "missing" },
      gear: { q: "missing" },
      throttle: { q: "missing" },
      brake: { q: "missing" },
      clutch: { q: "missing" },
    });
    const model = buildPedalsTelemetryCompactViewModelV2(frame, { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    expect(model.throttle).toBe(0);
    expect(model.speedKph).toBeUndefined();
    expect(model.speedText).toBe("—");
    expect(model.rpmText).toBe("—");
    expect(model.gearText).toBe("—");
  });

  it("propaga lifecycle stale/disconnected/error", () => {
    const frame = goldenFrame();
    expect(buildPedalsTelemetryCompactViewModelV2(frame, { state: "stale" }, { showSpeed: true, showRpm: true, showClutch: false }).status).toBe("stale");
    expect(buildPedalsTelemetryCompactViewModelV2(frame, { state: "stopped" }, { showSpeed: true, showRpm: true, showClutch: true }).status).toBe("disconnected");
    expect(buildPedalsTelemetryCompactViewModelV2(frame, { state: "error", reason: "boom" }, { showSpeed: true, showRpm: true, showClutch: true }).statusMessage).toBe("boom");
  });

  it("respeta flags de visibilidad", () => {
    const frame = goldenFrame();
    const model = buildPedalsTelemetryCompactViewModelV2(frame, { state: "live" }, { showSpeed: false, showRpm: false, showClutch: false });
    expect(model.showSpeed).toBe(false);
    expect(model.showRpm).toBe(false);
    expect(model.showClutch).toBe(false);
  });

  it("convierte mph y mps correctamente (reusa speedInKph hermano)", () => {
    const mphFrame: OverlayFrameV2 = { ...goldenFrame(), units: { ...goldenFrame().units, speed: "mph" }, player: { ...goldenFrame().player, speed: { v: 100, q: "fresh" } } };
    const mph = buildPedalsTelemetryCompactViewModelV2(mphFrame, { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    expect(mph.speedKph).toBeCloseTo(160.9344, 3);
    const mpsFrame: OverlayFrameV2 = { ...goldenFrame(), units: { ...goldenFrame().units, speed: "mps" }, player: { ...goldenFrame().player, speed: { v: 50, q: "fresh" } } };
    const mps = buildPedalsTelemetryCompactViewModelV2(mpsFrame, { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    expect(mps.speedKph).toBeCloseTo(180, 9);
  });

  it("formatea textos con los helpers compartidos del canal pedals", () => {
    const v2 = buildPedalsTelemetryCompactViewModelV2(goldenFrame(), { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    expect(v2.speedText).toBe(formatPedalsTelemetrySpeed(v2.speedKph));
    expect(v2.rpmText).toBe(formatPedalsTelemetryRpm(v2.rpm));
    expect(v2.gearText).toBe(formatPedalsTelemetryGear(v2.gear));
  });
});
