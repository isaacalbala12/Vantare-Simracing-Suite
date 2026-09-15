import { describe, expect, it } from "vitest";
import type {
  StrategyOrbitCalculationInputV1,
  StrategyOrbitCalculatedPlanV1,
} from "../../strategy/strategy-application-client";
import {
  RECORDED_STINT_EDIT_VARIANT_ID,
  recordedStintComparisonInput,
  type RecordedStintConstraint,
} from "./strategy-recorded-stint-constraints";
import type { RecordedCalculationState } from "./use-recorded-calculation";

const input: StrategyOrbitCalculationInputV1 = {
  event: { raceKind: "laps", targetLaps: 12, durationMinutes: 0, tankLiters: 40, pitLossSeconds: 25, virtualEnergy: { applicability: "not_applicable" } },
  drivers: [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam", paceDeltaSeconds: 0.5 }],
  variants: [{ id: "recorded-main", mode: "dry", driverOrderMode: "free", order: ["alex", "sam"], overrides: {} }],
  activeVariantId: "recorded-main",
  planningInputs: { overrides: {} },
};

const basePlan = {
  totalLaps: 12,
  total: 1_220,
  stops: 1,
  stints: [
    { i: 0, d: "alex", laps: 7 },
    { i: 1, d: "sam", laps: 5 },
  ],
} as unknown as StrategyOrbitCalculatedPlanV1;

function success(): Extract<RecordedCalculationState, { status: "success" }> {
  return { status: "success", input, result: { plans: { "recorded-main": basePlan }, comparisons: {} } };
}

describe("recordedStintComparisonInput", () => {
  it("keeps the exact base and adds one constrained variant", () => {
    const state = success();
    const constrained = recordedStintComparisonInput(state, [
      { index: 0, laps: 6 },
      { index: 1, driverId: "alex" },
    ]);

    expect(constrained.activeVariantId).toBe("recorded-stint-edit");
    expect(constrained.variants).toEqual([
      input.variants[0],
      {
        id: "recorded-stint-edit",
        mode: "dry",
        driverOrderMode: "fixed",
        order: ["alex", "alex"],
        overrides: { 0: { laps: 6 } },
      },
    ]);
    expect(constrained.event).toEqual(input.event);
    expect(constrained.planningInputs).toEqual(input.planningInputs);
    expect(constrained).not.toBe(input);
    expect(input.variants).toHaveLength(1);
    expect(basePlan.stints[1].d).toBe("sam");
  });

  it.each([
    ["missing result", { status: "idle" } as RecordedCalculationState, [{ index: 0, laps: 6 }]],
    ["empty edit", success(), []],
    ["bad index", success(), [{ index: 2, laps: 1 }]],
    ["unknown driver", success(), [{ index: 0, driverId: "missing" }]],
    ["bad laps", success(), [{ index: 0, laps: 0 }]],
    ["duplicate", success(), [{ index: 0, laps: 6 }, { index: 0, laps: 5 }]],
    ["no change", success(), [{ index: 0, driverId: "alex", laps: 7 }]],
  ] satisfies readonly [string, RecordedCalculationState, readonly RecordedStintConstraint[]][])("rejects %s", (_name, state, edits) => {
    expect(() => recordedStintComparisonInput(state, edits)).toThrow("Invalid recorded stint constraints");
  });

  it("returns to the exact base without preparing telemetry again", () => {
    const initial = success();
    const state: Extract<RecordedCalculationState, { status: "success" }> = {
      ...initial,
      input: { ...initial.input, activeVariantId: RECORDED_STINT_EDIT_VARIANT_ID },
      result: { ...initial.result, plans: { ...initial.result.plans, [RECORDED_STINT_EDIT_VARIANT_ID]: basePlan } },
    };
    expect(recordedStintComparisonInput(state, [
      { index: 0, driverId: "alex", laps: 7 },
      { index: 1, driverId: "sam", laps: 5 },
    ])).toMatchObject({ activeVariantId: "recorded-main", variants: [{ id: "recorded-main" }] });
  });
});
