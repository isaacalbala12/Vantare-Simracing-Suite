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

  it("carries the absolute capture instants Go derived", () => {
    const frame = goldenFrame(20);
    expect(frame.controls.history.capturedAtMS).toEqual([1787140801000, 1787140802000]);
    const model = buildInputTelemetryViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.history.map((sample) => sample.capturedAt)).toEqual([1787140801000, 1787140802000]);
  });

  it("keeps only the samples inside the configured window", () => {
    const history = {
      q: "fresh" as const,
      capturedAtMS: [92_000, 94_000, 97_000, 100_000],
      throttle: [0, 250, 500, 1000],
      brake: [1000, 750, 500, 0],
      clutch: [0, 0, 0, 0],
      speedMPS: [
        { v: 10, q: "fresh" as const },
        { v: 20, q: "fresh" as const },
        { v: 40, q: "fresh" as const },
        { v: 82.5, q: "fresh" as const },
      ],
      rpm: [
        { v: 3000, q: "fresh" as const },
        { v: 4000, q: "fresh" as const },
        { v: 6000, q: "fresh" as const },
        { v: 7250, q: "fresh" as const },
      ],
      gear: [
        { v: 2, q: "fresh" as const },
        { v: 3, q: "fresh" as const },
        { v: 5, q: "fresh" as const },
        { v: 6, q: "fresh" as const },
      ],
    };
    // Newest instant is 100_000; a 4 s window keeps the samples at >= 96_000.
    const inWindow = decodeControlsHistory(history, 4);
    expect(inWindow).toHaveLength(2);
    expect(inWindow.map((sample) => sample.throttle)).toEqual([0.5, 1]);
    expect(decodeControlsHistory(history, 8)).toHaveLength(4);
  });

  it("decodes per-mille integers back into ratios and clamps hostile input", () => {
    const decoded = decodeControlsHistory(
      {
        q: "fresh",
        capturedAtMS: [900, 1000],
        throttle: [1234, -5],
        brake: [1000, 0],
        clutch: [500, 500],
        speedMPS: [
          { v: 82.5, q: "fresh" as const },
          { q: "missing" as const },
        ],
        rpm: [
          { v: 7250, q: "fresh" as const },
          { v: 7250, q: "fresh" as const },
        ],
        gear: [
          { v: 6, q: "fresh" as const },
          { v: 6, q: "fresh" as const },
        ],
      },
      8,
    );
    expect(decoded.map((sample) => sample.throttle)).toEqual([1, 0]);
    expect(decoded.map((sample) => sample.clutch)).toEqual([0.5, 0.5]);
    expect(decoded.map((sample) => sample.capturedAt)).toEqual([900, 1000]);
    expect(decoded[0].speedKph).toBeCloseTo(297, 10);
    expect(decoded[1].speedKph).toBeUndefined();
  });

  it("publishes no series at all when the canonical history is absent or invalid", () => {
    expect(decodeControlsHistory({ q: "missing" }, 4)).toEqual([]);
    expect(
      decodeControlsHistory(
        {
          q: "invalid",
          capturedAtMS: [1000],
          throttle: [500],
          brake: [500],
          clutch: [500],
          speedMPS: [{ v: 50, q: "fresh" as const }],
          rpm: [{ v: 7000, q: "fresh" as const }],
          gear: [{ v: 4, q: "fresh" as const }],
        },
        4,
      ),
    ).toEqual([]);
    const frame = goldenFrame(20);
    const model = buildInputTelemetryViewModelV2(
      { ...frame, controls: { history: { q: "missing" } } },
      { state: "live" },
      CONTENT,
    );
    expect(model.history).toEqual([]);
  });

  it("can build the instantaneous shadow model without decoding the history", () => {
    const frame = goldenFrame(20);
    const controls = Object.create(frame.controls, {
      history: { get: () => { throw new Error("history decoded"); } },
    }) as OverlayFrameV2["controls"];
    const model = buildInputTelemetryViewModelV2(
      { ...frame, controls },
      { state: "live" },
      CONTENT,
      { includeHistory: false },
    );
    expect(model.history).toEqual([]);
    expect(model.throttle).toBeGreaterThanOrEqual(0);
  });

  it("carries per-sample motion from the canonical series", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTENT);
    // The golden fixture holds the player at 50 m/s, 7200 rpm, gear 4.
    expect(model.history.map((sample) => sample.speedKph)).toEqual([180, 180]);
    expect(model.history.map((sample) => sample.rpm)).toEqual([7200, 7200]);
    expect(model.history.map((sample) => sample.gear)).toEqual([4, 4]);
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
