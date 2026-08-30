import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2, OverlayUpdateV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { buildDeltaViewModelV2 } from "../widget-types/delta/delta-view-model-v2";
import { fuelStrategyDefinition } from "../widget-types/fuel-strategy/fuel-strategy-definition";
import { buildFuelStrategyViewModelV2 } from "../widget-types/fuel-strategy/fuel-strategy-view-model-v2";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import { buildRelativeViewModelV2 } from "../widget-types/relative/relative-view-model-v2";
import {
  OVERLAY_V2_DELTA_DECLARED_GAPS,
  OVERLAY_V2_FUEL_DECLARED_GAPS,
  OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES,
  OVERLAY_V2_FUEL_TOLERANCES,
  OVERLAY_V2_RELATIVE_DECLARED_GAPS,
  OVERLAY_V2_RELATIVE_GAP_TOLERANCE,
  compareDeltaModels,
  compareFuelModels,
  compareRelativeModels,
  createOverlayV2PlayerInstrumentsComparator,
} from "./overlay-shadow-comparator";

const DELTA_CONTENT = deltaDefinition.parseContent({ reference: "personal-best" });
const RELATIVE_CONTENT = relativeDefinition.parseContent({});
const FUEL_CONTENT = fuelStrategyDefinition.parseContent({});

describe("shadow comparator: delta, relative and fuel features", () => {
  it("labels every metric with its feature, field and phase", () => {
    const frame = goldenFrame(20);
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const source: OverlaySourceStatusV2 = { state: "live" };

    comparator.compareDelta({ legacySnapshot: legacy(), frame, source, content: DELTA_CONTENT });
    comparator.compareRelative({ legacySnapshot: legacy(), frame, source, content: RELATIVE_CONTENT });
    comparator.compareFuel({ legacySnapshot: legacy(), frame, source, content: FUEL_CONTENT });

    const summary = comparator.sessionSummary();
    // Only the anchor feature advances the gate denominator.
    expect(summary.framesByPhase.live).toBe(0);
    for (const key of Object.keys(summary.metrics)) {
      expect(key).toMatch(
        /^overlay_shadow_mismatches_total\{feature="(delta|relative|fuel)",field=".+",phase="live"\}$/,
      );
    }
  });

  it("accounts every non-live feature as not comparable", () => {
    const frame = goldenFrame(20);
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    // A stale->live sequence: v1 keeps the last known value while the v2 view
    // models hide a stale one on purpose, so only the live tick can fail.
    const sequence: readonly OverlaySourceStatusV2[] = [
      { state: "stale" }, { state: "stale" }, { state: "live" },
    ];
    for (const source of sequence) {
      const legacySnapshot: TelemetrySnapshot = {
        ...legacy(),
        status: source.state === "stale" ? "stale" : "ready",
      };
      comparator.compareDelta({ legacySnapshot, frame, source, content: DELTA_CONTENT });
      comparator.compareRelative({ legacySnapshot, frame, source, content: RELATIVE_CONTENT });
      comparator.compareFuel({ legacySnapshot, frame, source, content: FUEL_CONTENT });
    }
    const summary = comparator.sessionSummary();
    expect(summary.mismatchesByPhase.stale).toBe(0);
    expect(summary.notComparable).toBe(6);
    expect(summary.mismatchesByPhase.live).toBe(summary.mismatches);
    expect(summary.mismatchesByPhase.transition).toBe(0);
  });

  it("marks a phase as transition when the two contracts disagree on freshness", () => {
    const frame = goldenFrame(20);
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const result = comparator.compareFuel({
      legacySnapshot: { ...legacy(), status: "stale" },
      frame,
      source: { state: "live" },
      content: FUEL_CONTENT,
    });
    expect(result.phase).toBe("transition");
  });
});

describe("delta comparison rules", () => {
  it("is equal to itself and reports the fields it does compare", () => {
    const model = buildDeltaViewModelV2(goldenFrame(20), { state: "live" });
    expect(compareDeltaModels(model, model)).toEqual([]);
    expect(compareDeltaModels(model, { ...model, tone: "losing" })).toEqual(["tone"]);
    expect(compareDeltaModels(model, { ...model, deltaText: "+9.999" })).toEqual(["deltaText"]);
  });

  it("compares the progress bar with an absolute tolerance, not exactly", () => {
    const model = { ...buildDeltaViewModelV2(goldenFrame(20), { state: "live" }), progress: 0.25 };
    expect(compareDeltaModels(model, { ...model, progress: 0.25 + 1e-12 })).toEqual([]);
    expect(compareDeltaModels(model, { ...model, progress: 0.26 })).toEqual(["progress"]);
  });

  it("declares the fields without a canonical signal instead of comparing them", () => {
    const model = buildDeltaViewModelV2(goldenFrame(20), { state: "live" });
    const invented = { ...model, bestLapText: "1:29.000", lapText: "LAP 12", predictedLapText: "1:30.500" };
    expect(compareDeltaModels(model, invented)).toEqual([]);
    expect(OVERLAY_V2_DELTA_DECLARED_GAPS).toEqual(
      expect.arrayContaining(["bestLapText", "lapText", "predictedLapText", "trend"]),
    );
  });
});

describe("relative comparison rules", () => {
  it("treats the window order as significant", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, RELATIVE_CONTENT);
    expect(model.rows.length).toBeGreaterThan(2);
    const swapped = { ...model, rows: [model.rows[1], model.rows[0], ...model.rows.slice(2)] };
    expect(compareRelativeModels(model, model)).toEqual([]);
    expect(compareRelativeModels(model, swapped)).toContain("rows.order");
  });

  it("keys rows by identity, so a value divergence is not reported as a reorder", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, RELATIVE_CONTENT);
    const changed = {
      ...model,
      rows: model.rows.map((row, index) => (index === 1 ? { ...row, driverName: "OTHER" } : row)),
    };
    const mismatches = compareRelativeModels(model, changed);
    expect(mismatches).toContain("rows[].driverName");
    expect(mismatches).not.toContain("rows.order");
  });

  it("reports a row missing on one side once, as an identity mismatch", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, RELATIVE_CONTENT);
    const dropped = { ...model, rows: model.rows.slice(0, -1) };
    const mismatches = compareRelativeModels(model, dropped);
    expect(mismatches).toContain("rows[].identity");
    expect(mismatches).toContain("rows.length");
  });

  it("compares the gap with an absolute tolerance", () => {
    const source = goldenFrame(44);
    const frame: OverlayFrameV2 = {
      ...source,
      standings: source.standings.map((row) => (
        row.id === source.player.id ? { ...row, pit: "track" } : row
      )),
    };
    const model = buildRelativeViewModelV2(frame, { state: "live" }, RELATIVE_CONTENT);
    const nudge = (delta: number) => ({
      ...model,
      rows: model.rows.map((row, index) =>
        index === 0 ? { ...row, gapSeconds: (row.gapSeconds ?? 0) + delta } : row,
      ),
    });
    expect(compareRelativeModels(model, nudge(OVERLAY_V2_RELATIVE_GAP_TOLERANCE / 2))).toEqual([]);
    expect(compareRelativeModels(model, nudge(1))).toContain("rows[].gapSeconds");
  });

  it("declares the fields without a canonical signal instead of comparing them", () => {
    const model = buildRelativeViewModelV2(goldenFrame(44), { state: "live" }, RELATIVE_CONTENT);
    const invented = {
      ...model,
      rows: model.rows.map((row) => ({
        ...row, driverNumber: "42", bestLapText: "1:29.000", gapText: "n/a", lastLapText: "1:31.000",
      })),
    };
    expect(compareRelativeModels(model, invented)).toContain("rows[].gapText");
    expect(OVERLAY_V2_RELATIVE_DECLARED_GAPS).not.toContain("rows[].gapText");
  });
});

describe("fuel comparison rules", () => {
  it("compares the tank with a tolerance and the laps projection exactly", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, FUEL_CONTENT);
    expect(compareFuelModels(model, model)).toEqual([]);
    expect(compareFuelModels(model, { ...model, fuelLiters: (model.fuelLiters ?? 0) + 1e-9 })).toEqual([]);
    expect(compareFuelModels(model, { ...model, fuelLiters: (model.fuelLiters ?? 0) + 1 })).toEqual(["fuelLiters"]);
    expect(OVERLAY_V2_FUEL_TOLERANCES.lapsRemaining).toBe(0);
    expect(compareFuelModels(model, { ...model, lapsRemaining: (model.lapsRemaining ?? 0) + 1 }))
      .toEqual(["lapsRemaining"]);
  });

  it("reports a value present on one side only as a divergence", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, FUEL_CONTENT);
    expect(compareFuelModels(model, { ...model, fuelLiters: undefined })).toEqual(["fuelLiters"]);
  });

  it("declares everything the frame does not publish instead of comparing it", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, FUEL_CONTENT);
    const invented = {
      ...model, requiredFuel: 42, fuelPercent: 0.5,
      history: [{ lap: 1, consumedLiters: 3.4 }],
    };
    expect(compareFuelModels(model, invented)).toEqual([]);
    expect(OVERLAY_V2_FUEL_DECLARED_GAPS).toEqual(
      expect.arrayContaining(["requiredFuel", "history", "fuelPercent"]),
    );
  });

  it("accounts the intentional differences instead of gating on them", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, FUEL_CONTENT);
    // A different average is expected: the two sides use different windows.
    expect(compareFuelModels(model, { ...model, avgPerLap: 3.4 })).toEqual([]);
    // Under basis "session" the two answer the same question, so the laps are
    // compared strictly; under basis "fuel" they do not, so they are not.
    const drifted = { ...model, lapsRemaining: (model.lapsRemaining ?? 0) + 1 };
    expect(compareFuelModels(model, drifted, "session")).toEqual(["lapsRemaining"]);
    expect(compareFuelModels(model, drifted, "fuel")).toEqual([]);
    expect(OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES).toEqual(
      expect.arrayContaining(["avgPerLap", "lapsRemaining"]),
    );
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
    player: { inPit: false },
    scoring: [],
  };
}
