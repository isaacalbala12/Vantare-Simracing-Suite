import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { buildPedalsViewModel } from "./pedals-view-model";
import { buildPedalsViewModelV2, pedalsDisplayedValues } from "./pedals-view-model-v2";

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

function buildSyntheticFrame(overrides: Partial<OverlayFrameV2["player"]> = {}): OverlayFrameV2 {
  const base = goldenFrame();
  return {
    ...base,
    player: { ...base.player, ...overrides },
  };
}

describe("pedals v2 view model", () => {
  it("construye modelo completo desde el frame v2", () => {
    const frame = goldenFrame();
    const model = buildPedalsViewModelV2(frame, { state: "live" }, {});
    // golden 20: throttle 0.75, brake 0.125, clutch missing -> 0
    expect(model.status).toBe("ready");
    expect(model.throttle).toBeCloseTo(0.75, 9);
    expect(model.brake).toBeCloseTo(0.125, 9);
    expect(model.clutch).toBe(0);
    expect(model.throttleText).toBe("75%");
    expect(model.brakeText).toBe("13%");
    expect(model.clutchText).toBe("0%");
  });

  it("placeholders cuando faltan señales (q=missing)", () => {
    const frame = buildSyntheticFrame({
      throttle: { q: "missing" },
      brake: { q: "missing" },
      clutch: { q: "missing" },
    });
    const model = buildPedalsViewModelV2(frame, { state: "live" }, {});
    // Sin señal el VM cae a 0% como v1 cuando snapshot.player.* era undefined.
    expect(model.throttle).toBe(0);
    expect(model.brake).toBe(0);
    expect(model.clutch).toBe(0);
    expect(model.throttleText).toBe("0%");
  });

  it("propaga lifecycle del source", () => {
    const frame = goldenFrame();
    expect(buildPedalsViewModelV2(frame, { state: "stopped" }, {}).status).toBe("disconnected");
    expect(buildPedalsViewModelV2(frame, { state: "error", reason: "boom" }, {}).status).toBe("error");
    expect(buildPedalsViewModelV2(frame, { state: "error", reason: "boom" }, {}).statusMessage).toBe("boom");
    expect(buildPedalsViewModelV2(frame, { state: "stale" }, {}).status).toBe("stale");
  });

  it("stale si algún pedal está en stale", () => {
    const frame = buildSyntheticFrame({
      throttle: { v: 0.5, q: "stale" },
      brake: { v: 0.2, q: "fresh" },
      clutch: { v: 0, q: "fresh" },
    });
    expect(buildPedalsViewModelV2(frame, { state: "live" }, {}).status).toBe("stale");
  });

  it("clamps 0..1 como v1", () => {
    const frame = buildSyntheticFrame({
      throttle: { v: 1.4, q: "fresh" },
      brake: { v: -0.2, q: "fresh" },
      clutch: { v: 0.5, q: "fresh" },
    });
    const model = buildPedalsViewModelV2(frame, { state: "live" }, {});
    expect(model.throttle).toBe(1);
    expect(model.brake).toBe(0);
    expect(model.clutch).toBe(0.5);
  });

  it("equivalencia de campos con v1 sobre fixture sintética", () => {
    // Sintética: pedales 0.78 / 0.12 / 1.4 -> v1 clamps 1.4 a 1 y formatea.
    // En v2 el frame ya trae esos valores; verificamos misma salida.
    const frame = buildSyntheticFrame({
      throttle: { v: 0.78, q: "fresh" },
      brake: { v: 0.12, q: "fresh" },
      clutch: { v: 1.4, q: "fresh" },
    });
    const v2 = buildPedalsViewModelV2(frame, { state: "live" }, {});
    const snapshot = {
      status: "ready" as const,
      capturedAt: Date.now(),
      session: { type: "race" as const },
      player: { inPit: false, throttle: 0.78, brake: 0.12, clutch: 1.4 },
      scoring: [],
    };
    const v1 = buildPedalsViewModel(snapshot, {});
    expect(v2.throttle).toBe(v1.throttle);
    expect(v2.brake).toBe(v1.brake);
    expect(v2.clutch).toBe(v1.clutch);
    expect(v2.throttleText).toBe(v1.throttleText);
    expect(v2.brakeText).toBe(v1.brakeText);
    expect(v2.clutchText).toBe(v1.clutchText);
  });

  it("expone proyección estable para comparación", () => {
    const displayed = pedalsDisplayedValues(buildPedalsViewModelV2(goldenFrame(), { state: "live" }, {}));
    expect(Object.keys(displayed).sort()).toEqual(["brake", "clutch", "status", "throttle"]);
  });
});
