import { describe, expect, it } from "vitest";
import type {
  OverlayControlsHistoryV2,
  OverlayFrameV2,
} from "../../../generated/telemetry";
import { inputTelemetryDefinition } from "./input-telemetry-definition";
import {
  buildInputTelemetryViewModelV2,
  decodeControlsHistory,
} from "./input-telemetry-view-model-v2";

const CONTENT = inputTelemetryDefinition.parseContent({});

function historyWithMotion(): OverlayControlsHistoryV2 {
  return {
    q: "fresh",
    capturedAtMS: [1_786_711_200_000, 1_786_711_201_000],
    throttle: [750, 750],
    brake: [125, 125],
    clutch: [0, 0],
    speedMPS: [
      { v: 50, q: "fresh" },
      { v: 51, q: "fresh" },
    ],
    rpm: [
      { v: 7200, q: "fresh" },
      { v: 7300, q: "fresh" },
    ],
    gear: [
      { v: 4, q: "fresh" },
      { v: 4, q: "fresh" },
    ],
  };
}

describe("input telemetry v2 absolute history decoder (A1)", () => {
  it("uses capturedAtMS verbatim without any frame or browser instant", () => {
    const samples = decodeControlsHistory(historyWithMotion(), 8);
    expect(samples.map((sample) => sample.capturedAt)).toEqual([
      1_786_711_200_000, 1_786_711_201_000,
    ]);
  });

  it("decodes per-sample motion with presentation-only km/h", () => {
    const samples = decodeControlsHistory(historyWithMotion(), 8);
    // Wire speed travels in m/s; the decoder presents km/h (x3.6).
    expect(samples.map((sample) => sample.speedKph)).toEqual([180, 183.6]);
    expect(samples.map((sample) => sample.rpm)).toEqual([7200, 7300]);
    expect(samples.map((sample) => sample.gear)).toEqual([4, 4]);
  });

  it("maps missing motion cells to undefined without shortening the series", () => {
    const history = historyWithMotion();
    const samples = decodeControlsHistory(
      {
        ...history,
        speedMPS: [{ q: "missing" }, { v: 51, q: "stale" }],
        rpm: [{ v: 7200, q: "invalid" }, { v: 7300, q: "fresh" }],
        gear: [{ q: "missing" }, { v: 4, q: "fresh" }],
      },
      8,
    );
    expect(samples).toHaveLength(2);
    expect(samples[0].speedKph).toBeUndefined();
    expect(samples[0].rpm).toBeUndefined();
    expect(samples[0].gear).toBeUndefined();
    expect(samples[1].speedKph).toBe(183.6);
    expect(samples[1].rpm).toBe(7300);
    expect(samples[1].gear).toBe(4);
  });

  it("trims by the configured window against the newest sample instant", () => {
    const samples = decodeControlsHistory(historyWithMotion(), 1);
    // Two samples 1000 ms apart; a 1 s window keeps both endpoints.
    expect(samples).toHaveLength(2);
    const wide: OverlayControlsHistoryV2 = {
      q: "fresh",
      capturedAtMS: [1_786_711_192_000, 1_786_711_201_000],
      throttle: [0, 1000],
      brake: [1000, 0],
      clutch: [0, 0],
      speedMPS: [
        { v: 10, q: "fresh" },
        { v: 82.5, q: "fresh" },
      ],
      rpm: [
        { v: 3000, q: "fresh" },
        { v: 7250, q: "fresh" },
      ],
      gear: [
        { v: 2, q: "fresh" },
        { v: 6, q: "fresh" },
      ],
    };
    // 9 s apart; a 4 s window keeps only the newest sample.
    expect(decodeControlsHistory(wide, 4)).toHaveLength(1);
    expect(decodeControlsHistory(wide, 8)).toHaveLength(1);
  });

  it("builds the widget history from capturedAtMS, never from generatedAt", () => {
    const history = historyWithMotion();
    const frame = {
      controls: { history },
      generatedAt: "1999-01-01T00:00:00.000Z",
      player: {
        throttle: { q: "fresh", v: 0.75 },
        brake: { q: "fresh", v: 0.125 },
        clutch: { q: "fresh", v: 0 },
        speed: { q: "fresh", v: 50 },
        rpm: { q: "fresh", v: 7200 },
        gear: { q: "fresh", v: 4 },
      },
      units: { speed: "mps" },
    } as unknown as OverlayFrameV2;
    const model = buildInputTelemetryViewModelV2(
      frame,
      { state: "live" },
      CONTENT,
    );
    expect(model.history.map((sample) => sample.capturedAt)).toEqual([
      1_786_711_200_000, 1_786_711_201_000,
    ]);
    // A deliberately ancient generatedAt must not move a single sample.
    expect(model.history[0].capturedAt).not.toBe(Date.parse(frame.generatedAt));
  });
});
