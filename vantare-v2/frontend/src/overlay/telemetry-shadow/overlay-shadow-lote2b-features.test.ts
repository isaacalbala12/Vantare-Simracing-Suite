import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2, OverlayUpdateV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { inputTelemetryDefinition } from "../widget-types/input-telemetry/input-telemetry-definition";
import { buildInputTelemetryViewModelV2 } from "../widget-types/input-telemetry/input-telemetry-view-model-v2";
import { resetInputTelemetryHistory } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import {
  OVERLAY_V2_CONTROLS_DECLARED_GAPS,
  OVERLAY_V2_CONTROLS_RATIO_TOLERANCE,
  compareControlsModels,
  createOverlayV2PlayerInstrumentsComparator,
} from "./overlay-shadow-comparator";
import { createOverlayV2ShadowRuntime } from "./overlay-v2-shadow-runtime";

const CONTROLS_CONTENT = inputTelemetryDefinition.parseContent({});

beforeEach(() => {
  // The v1 accumulator is module state shared by every widget id.
  resetInputTelemetryHistory();
});

describe("shadow comparator: controls feature", () => {
  it("labels every controls metric with its feature, field and phase", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    // A legacy snapshot whose pedals disagree with the frame, so there is a
    // mismatch to label in the first place.
    comparator.compareControls({
      legacySnapshot: { ...legacy(), player: { inPit: false, throttle: 0.1, brake: 0.9, clutch: 0 } },
      legacyHistory: [],
      frame: goldenFrame(20),
      source: { state: "live" },
      content: CONTROLS_CONTENT,
    });

    const summary = comparator.sessionSummary();
    const keys = Object.keys(summary.metrics);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^overlay_shadow_mismatches_total\{feature="controls",field=".+",phase="live"\}$/);
    }
    // Only the anchor feature moves the gate denominator.
    expect(summary.framesByPhase.live).toBe(0);
  });

  it("accounts controls outside live as not comparable", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const sequence: readonly OverlaySourceStatusV2[] = [
      { state: "stale" }, { state: "stale" }, { state: "live" },
    ];
    for (const source of sequence) {
      comparator.compareControls({
        legacySnapshot: {
          ...legacy(),
          status: source.state === "stale" ? "stale" : "ready",
          player: { inPit: false, throttle: 0.1, brake: 0.9, clutch: 0 },
        },
        legacyHistory: [],
        frame: goldenFrame(20),
        source,
        content: CONTROLS_CONTENT,
      });
    }
    const summary = comparator.sessionSummary();
    expect(summary.mismatchesByPhase.stale).toBe(0);
    expect(summary.notComparable).toBe(2);
    expect(summary.mismatchesByPhase.live).toBe(summary.mismatches);
    expect(summary.mismatchesByPhase.transition).toBe(0);
    expect(summary.declaredDifferences).toBeGreaterThan(0);
  });

  it("marks a controls phase as transition when the two contracts disagree on freshness", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const result = comparator.compareControls({
      legacySnapshot: { ...legacy(), status: "stale" },
      legacyHistory: [],
      frame: goldenFrame(20),
      source: { state: "live" },
      content: CONTROLS_CONTENT,
    });
    expect(result.phase).toBe("transition");
  });

  it("pairs a legacy snapshot with its v2 frame through the shadow runtime", () => {
    const runtime = createOverlayV2ShadowRuntime();
    const frame = goldenFrame(20);
    runtime.acceptLegacy(frame.epoch, frame.sequence, legacy());
    runtime.acceptOverlayV2(frame, { state: "live" });
    const summary = runtime.sessionSummary();
    // The runtime recorded the legacy sample into its own accumulator, so the
    // controls feature was compared with a real v1 series and not an empty one.
    expect(summary.framesByPhase.live).toBeGreaterThan(0);
  });
});

describe("controls comparison rules", () => {
  it("is equal to itself", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTROLS_CONTENT);
    expect(compareControlsModels(model, model)).toEqual([]);
  });

  it("absorbs the per-mille quantization and nothing wider", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTROLS_CONTENT);
    expect(OVERLAY_V2_CONTROLS_RATIO_TOLERANCE).toBe(5e-4);
    expect(compareControlsModels(model, { ...model, brake: model.brake + 4e-4 })).toEqual([]);
    expect(compareControlsModels(model, { ...model, brake: model.brake + 0.01 }))
      .toEqual(expect.arrayContaining(["brake"]));
  });

  it("does not align the two series by array index without comparable timestamps", () => {
    const evidence = JSON.parse(readFileSync(path.resolve(
      process.cwd(),
      "src/overlay/telemetry-shadow/testdata/s1-on-20260830-192729.json",
    ), "utf8")) as { shadow: { metrics: Record<string, number> } };
    expect(evidence.shadow.metrics).toHaveProperty(
      'overlay_shadow_mismatches_total{feature="controls",field="history[].throttle",phase="live"}',
      166,
    );
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTROLS_CONTENT);
    const older = { capturedAt: 0, throttle: 0.5, brake: 0.5, clutch: 0 };
    // A longer v1 series that agrees on every sample both sides cover is not a
    // divergence: the extra samples are warm-up the v2 path never saw.
    expect(compareControlsModels({ ...model, history: [older, ...model.history] }, model)).toEqual([]);
    // S1 ON measured these values at different cadences/phases. Without a
    // shared sample timestamp, the same index is not the same observation.
    const diverged = model.history.map((sample, index) =>
      index === model.history.length - 1 ? { ...sample, throttle: sample.throttle + 0.2 } : sample,
    );
    expect(compareControlsModels({ ...model, history: diverged }, model)).toEqual([]);
  });

  it("declares a series present on one side only instead of inventing parity", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTROLS_CONTENT);
    expect(model.history.length).toBeGreaterThan(0);
    expect(compareControlsModels({ ...model, history: [] }, model)).toEqual([]);
  });

  it("declares the per-sample fields the canonical series cannot carry", () => {
    const model = buildInputTelemetryViewModelV2(goldenFrame(20), { state: "live" }, CONTROLS_CONTENT);
    const invented = {
      ...model,
      history: model.history.map((sample) => ({
        ...sample, capturedAt: sample.capturedAt + 5_000, speedKph: 200, rpm: 7_000, gear: 5,
      })),
    };
    expect(compareControlsModels(model, invented)).toEqual([]);
    expect(OVERLAY_V2_CONTROLS_DECLARED_GAPS).toEqual(expect.arrayContaining([
      "history.length", "history[].capturedAt", "history[].throttle", "history[].brake",
      "history[].clutch", "history[].speedKph", "history[].rpm", "history[].gear",
    ]));
  });
});

/**
 * Spotter and damage are deliberately absent from this comparator, and that is
 * the T4 outcome for them rather than an omission:
 *
 *   - spotter has no Overlay v1 widget or view model to compare against, so
 *     the v2 section is a new feature with no parity to measure. Its evidence
 *     is the Go builder's own tests.
 *   - damage has no Overlay v2 view model, because the canonical carries no
 *     damage signal at all. There is nothing on the v2 side to compare.
 */
describe("features without a comparison", () => {
  it("has no v1 or v2 view model to pair for spotter or damage", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    expect(Object.keys(comparator)).not.toContain("compareSpotter");
    expect(Object.keys(comparator)).not.toContain("compareDamage");
    // The v2 frame does carry a spotter section; it simply has no consumer yet.
    expect(goldenFrame(20).spotter.mode).toBe("none");
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

function legacy(): TelemetrySnapshot {
  return {
    status: "ready",
    capturedAt: Date.parse("2026-08-19T12:00:02Z"),
    session: { type: "race", trackName: "Sebring" },
    player: { inPit: false, throttle: 0.75, brake: 0.125, clutch: 0 },
    scoring: [],
  };
}
