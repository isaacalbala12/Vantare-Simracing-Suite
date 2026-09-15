import { describe, expect, it } from "vitest";
import type { StrategyOrbitCalculationInputV1, StrategyOrbitCalculationResultV1 } from "../../strategy/strategy-application-client";
import { recordedPitComparisonInput, RECORDED_PIT_EDIT_VARIANT_ID } from "./strategy-recorded-pit-constraints";
import type { RecordedCalculationState } from "./use-recorded-calculation";

const input = {
  event: { raceKind: "laps", targetLaps: 4, durationMinutes: 0, tankLiters: 10, pitLossSeconds: 20, virtualEnergy: { applicability: "applicable", capacityPercent: 100, reservePercent: 0 } },
  drivers: [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }],
  variants: [{ id: "recorded-main", mode: "dry", driverOrderMode: "free", order: ["alex", "sam"], overrides: {} }],
  activeVariantId: "recorded-main",
} satisfies StrategyOrbitCalculationInputV1;
const result = { plans: { "recorded-main": {
  totalLaps: 4,
  stints: [{ d: "alex", laps: 1 }, { d: "sam", laps: 3 }],
  stopDetails: [{ index: 0, lap: 1, fuelInLiters: 1, fuelOutLiters: 5, virtualEnergyInPercent: 10, virtualEnergyOutPercent: 20, pitLossSeconds: 20, pitTransitSeconds: 10, pitServiceSeconds: 10, pitOverlapSeconds: 0, pitBreakdownAvailable: true }],
} }, comparisons: {} } as unknown as StrategyOrbitCalculationResultV1;
const state = { status: "success", key: "key", input, result } satisfies RecordedCalculationState;

describe("recordedPitComparisonInput", () => {
  it("fixes every visible boundary and stop while retaining the exact base", () => {
    const next = recordedPitComparisonInput(state, [{ index: 0, fuelLiters: 4, vePercent: 10 }]);
    expect(next.variants[0]).toEqual(input.variants[0]);
    expect(next.variants[1]).toEqual({
      ...input.variants[0], id: RECORDED_PIT_EDIT_VARIANT_ID, driverOrderMode: "fixed", order: ["alex", "sam"],
      overrides: { 0: { laps: 1 }, 1: { laps: 3 } },
      pitOverrides: { 0: { fuelLiters: 4, vePercent: 10 } },
    });
    expect(next.activeVariantId).toBe(RECORDED_PIT_EDIT_VARIANT_ID);
    expect(input.variants[0]).toEqual({ id: "recorded-main", mode: "dry", driverOrderMode: "free", order: ["alex", "sam"], overrides: {} });
  });

  it.each([
    [[]],
    [[{ index: 1, fuelLiters: 1 }]],
    [[{ index: 0, fuelLiters: -1 }]],
    [[{ index: 0, fuelLiters: Number.NaN }]],
  ])("rejects incomplete or invalid stop constraints %#", constraints => {
    expect(() => recordedPitComparisonInput(state, constraints)).toThrow("Recorded pit constraints are invalid");
  });

  it("updates an existing pit edit against its retained base", () => {
    const first = recordedPitComparisonInput(state, [{ index: 0, fuelLiters: 4, vePercent: 10 }]);
    const editedPlan = { ...result.plans["recorded-main"], stopDetails: [{ ...result.plans["recorded-main"].stopDetails[0], fuelOutLiters: 6 }] };
    const editedState = { status: "success", key: "key", input: first, result: { plans: { "recorded-main": result.plans["recorded-main"], [RECORDED_PIT_EDIT_VARIANT_ID]: editedPlan }, comparisons: {} } } satisfies RecordedCalculationState;
    const next = recordedPitComparisonInput(editedState, [{ index: 0, fuelLiters: 5, vePercent: 10 }]);
    expect(next.variants.map(variant => variant.id)).toEqual(["recorded-main", RECORDED_PIT_EDIT_VARIANT_ID]);
    expect(next.variants[1].pitOverrides).toEqual({ 0: { fuelLiters: 5, vePercent: 10 } });
  });
});
