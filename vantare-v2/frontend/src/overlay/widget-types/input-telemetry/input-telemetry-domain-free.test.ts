import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_CONTROLS,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import { inputTelemetryDefinition } from "./input-telemetry-definition";
import {
  OVERLAY_V2_CONTROLS_DECLARED_GAPS,
  buildInputTelemetryViewModelV2,
  decodeControlsHistory,
  inputTelemetryDisplayedValues,
} from "./input-telemetry-view-model-v2";

const CONTENT = inputTelemetryDefinition.parseContent({});

describe("input telemetry v2 view model", () => {
  it("is authoritative by default and remains explicitly addressable", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toContain(OVERLAY_V2_CONTROLS);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_CONTROLS)).toBe(true);
    expect(hasOverlayV2Feature([OVERLAY_V2_CONTROLS], OVERLAY_V2_CONTROLS)).toBe(true);
  });

  it("reads the series Go derived instead of accumulating one in the browser", () => {
    const frame = goldenFrame(20);
    expect(frame.controls.history.q).toBe("fresh");
    const model = buildInputTelemetryViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.history).toHaveLength(frame.controls.history.throttle?.length ?? 0);
    // The golden fixture holds the player at 0.75 throttle and 0.125 brake.
    expect(model.history.map((sample) => sample.throttle)).toEqual([0.75, 0.75]);
    expect(model.history.map((sample) => sample.brake)).toEqual([0.125, 0.125]);
    expect(model.history.map((sample) => sample.clutch)).toEqual([0, 0]);
  });

  it("spaces the samples across windowMs ending at the frame instant", () => {
    const frame = goldenFrame(20);
    expect(frame.controls.history.windowMs).toBe(1000);
    const model = buildInputTelemetryViewModelV2(frame, { state: "live" }, CONTENT);
    const frameMillis = Date.parse(frame.generatedAt);
    expect(model.history.map((sample) => sample.capturedAt)).toEqual([frameMillis - 1000, frameMillis]);
  });

  it("keeps only the samples inside the configured window", () => {
    const history = {
      q: "fresh" as const,
      windowMs: 8000,
      throttle: [0, 250, 500, 1000],
      brake: [1000, 750, 500, 0],
      clutch: [0, 0, 0, 0],
    };
    // 4 samples across 8 s is one every 2667 ms; a 4 s window keeps the last 2.
    const inWindow = decodeControlsHistory(history, 100_000, 4);
    expect(inWindow).toHaveLength(2);
    expect(inWindow.map((sample) => sample.throttle)).toEqual([0.5, 1]);
    expect(decodeControlsHistory(history, 100_000, 8)).toHaveLength(4);
  });

  it("decodes per-mille integers back into ratios and clamps hostile input", () => {
    const decoded = decodeControlsHistory(
      { q: "fresh", windowMs: 100, throttle: [1234, -5], brake: [1000, 0], clutch: [500, 500] },
      1_000,
      8,
    );
    expect(decoded.map((sample) => sample.throttle)).toEqual([1, 0]);
    expect(decoded.map((sample) => sample.clutch)).toEqual([0.5, 0.5]);
  });

  it("publishes no series at all when the canonical history is absent or invalid", () => {
    expect(decodeControlsHistory({ q: "missing" }, 1_000, 4)).toEqual([]);
    expect(decodeControlsHistory({ q: "invalid", throttle: [500] }, 1_000, 4)).toEqual([]);
    const frame = goldenFrame(20);
    const model = buildInputTelemetryViewModelV2(
      { ...frame, controls: { history: { q: "missing" } } },
      { state: "live" },
      CONTENT,
    );
    expect(model.history).toEqual([]);
  });

  it("declares what the canonical series cannot carry instead of inventing it", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTENT);
    for (const sample of model.history) {
      expect(sample.speedKph).toBeUndefined();
      expect(sample.rpm).toBeUndefined();
      expect(sample.gear).toBeUndefined();
    }
    expect(OVERLAY_V2_CONTROLS_DECLARED_GAPS).toEqual(
      expect.arrayContaining([
        "history.length", "history[].capturedAt", "history[].throttle", "history[].brake",
        "history[].clutch", "history[].speedKph", "history[].rpm", "history[].gear",
      ]),
    );
  });

  it("propagates the source lifecycle instead of drawing a dead series", () => {
    const frame = goldenFrame(20);
    expect(buildInputTelemetryViewModelV2(frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildInputTelemetryViewModelV2(frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.history).toEqual([]);
    expect(stopped.throttle).toBe(0);
  });

  it("exposes a stable displayed projection for the shadow comparator", () => {
    const displayed = inputTelemetryDisplayedValues(
      buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTENT),
    );
    expect(Object.keys(displayed).sort()).toEqual([
      "brake", "clutch", "historyRatios", "historyRows", "status", "throttle",
    ]);
    expect(displayed.historyRows).toBe("2");
  });
});

function goldenFrame(vehicles: number): OverlayFrameV2 {
  const update = JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
