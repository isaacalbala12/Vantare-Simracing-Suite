import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2 } from "../../../generated/telemetry";
import { decodeOverlayUpdateV2 } from "../../../telemetry-transport/overlay-frame-v2-store";
import { buildPedalsTelemetryViewModelV2 } from "./pedals-telemetry-view-model-v2";

const content = { showPosition: true, showClutch: true };

function frame(): OverlayFrameV2 {
  const update = decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
    process.cwd(), "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json",
  ), "utf8")));
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

describe("pedals telemetry production data", () => {
  it("reads player controls and instruments without treating absent steering as an invalid pedal", () => {
    const model = buildPedalsTelemetryViewModelV2(frame(), { state: "live" }, content);
    expect(model.status).toBe("ready");
    expect(model.throttle).toBeCloseTo(0.75);
    expect(model.brake).toBeCloseTo(0.125);
    expect(model.speedKph).toBeCloseTo(180);
    expect(model.rpm).toBe(7200);
    expect(model.gear).toBe(4);
    expect(model.steering).toBe(0);
  });

  it("distinguishes a fresh zero pedal from a missing or invalid input", () => {
    const base = frame();
    const zero = { ...base, player: { ...base.player, throttle: { q: "fresh" as const } } };
    expect(buildPedalsTelemetryViewModelV2(zero, { state: "live" }, content).status).toBe("ready");
    const missing = { ...base, player: { ...base.player, throttle: { q: "missing" as const } } };
    const result = buildPedalsTelemetryViewModelV2(missing, { state: "live" }, content);
    expect(result.status).toBe("missing");
    expect(result.throttle).toBe(0);
    const invalid = { ...base, player: { ...base.player, speed: { q: "invalid" as const } } };
    expect(buildPedalsTelemetryViewModelV2(invalid, { state: "live" }, content).status).toBe("missing");
    expect(buildPedalsTelemetryViewModelV2(invalid, { state: "live" }, content).speedText).toBe("—");
  });

  it("honors visibility and does not classify unavailable steering as stale", () => {
    const base = frame();
    const optional = { ...base, player: { ...base.player, clutch: { q: "missing" as const }, steering: { q: "stale" as const, v: 0.2 } } };
    expect(buildPedalsTelemetryViewModelV2(optional, { state: "live" }, { showPosition: false, showClutch: false }).status).toBe("ready");
    expect(buildPedalsTelemetryViewModelV2(optional, { state: "live" }, content).status).toBe("missing");
  });

  it("clears old values during connecting, stopping and stopped lifecycle states", () => {
    for (const state of ["connecting", "detecting", "stopping", "stopped"] as const) {
      const model = buildPedalsTelemetryViewModelV2(frame(), { state }, content);
      expect(model.status).toBe("disconnected");
      expect(model.throttle).toBe(0);
      expect(model.speedText).toBe("—");
      expect(model.rpmText).toBe("—");
      expect(model.gearText).toBe("—");
    }
    expect(buildPedalsTelemetryViewModelV2(frame(), { state: "error" }, content).status).toBe("error");
  });

  it("propagates stale quality and bounds malformed pedal values", () => {
    const base = frame();
    const stale = { ...base, player: { ...base.player, brake: { q: "stale" as const, v: 0.2 } } };
    expect(buildPedalsTelemetryViewModelV2(stale, { state: "live" }, content).status).toBe("stale");
    const malformed = { ...base, player: { ...base.player, throttle: { q: "fresh" as const, v: 1.4 }, brake: { q: "fresh" as const, v: -0.2 } } };
    const bounded = buildPedalsTelemetryViewModelV2(malformed, { state: "live" }, content);
    expect(bounded.throttle).toBe(1);
    expect(bounded.brake).toBe(0);
  });
});
