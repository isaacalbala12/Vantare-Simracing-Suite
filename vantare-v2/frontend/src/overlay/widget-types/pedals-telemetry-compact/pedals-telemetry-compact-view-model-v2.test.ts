import { buildPedalsTelemetryViewModelV2 } from "../pedals-telemetry/pedals-telemetry-view-model-v2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildPedalsTelemetryCompactViewModel } from "./pedals-telemetry-compact-view-model";
import { buildPedalsTelemetryCompactViewModelV2 } from "./pedals-telemetry-compact-view-model-v2";

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

  it("equivalencia con v1 sobre fixture sintética", () => {
    const v2 = buildPedalsTelemetryCompactViewModelV2(goldenFrame(), { state: "live" }, { showSpeed: true, showRpm: true, showClutch: true });
    const snapshot = {
      status: "ready" as const,
      capturedAt: Date.now(),
      session: { type: "race" as const },
      player: { inPit: false, throttle: 0.75, brake: 0.125, clutch: 0, speedKph: 180, rpm: 7200, gear: 4 },
      scoring: [],
    };
    const v1 = buildPedalsTelemetryCompactViewModel(snapshot, { showSpeed: true, showRpm: true, showClutch: true });
    expect(v2.throttle).toBeCloseTo(v1.throttle, 9);
    expect(v2.brake).toBeCloseTo(v1.brake, 9);
    expect(v2.speedKph).toBeCloseTo(v1.speedKph ?? 0, 9);
    expect(v2.speedText).toBe(v1.speedText);
    expect(v2.rpmText).toBe(v1.rpmText);
    expect(v2.gearText).toBe(v1.gearText);
  });
});

it.each([[-1,"R"],[0,"N"],[5,"5"],[-2,"\u2014"]] as const)("both V2 instruments format gear %s", (v, text) => {
 const frame=syntheticFrame({gear:{q:"ok",v}});
 expect(buildPedalsTelemetryCompactViewModelV2(frame,{state:"live"},{showSpeed:true,showRpm:true,showClutch:true}).gearText).toBe(text);
 expect(buildPedalsTelemetryViewModelV2(frame,{state:"live"},{showPosition:true,showClutch:true}).gearText).toBe(text);
});
