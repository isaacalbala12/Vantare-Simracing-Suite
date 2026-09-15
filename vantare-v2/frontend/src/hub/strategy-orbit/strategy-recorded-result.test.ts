import { describe, expect, it } from "vitest";
import type { StrategyOrbitCalculationInputV1, StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedRevisionPayload } from "./strategy-recorded-result";

const input: StrategyOrbitCalculationInputV1 = {
  event: { raceKind: "laps", targetLaps: 4, durationMinutes: 0, tankLiters: 10, pitLossSeconds: 20, virtualEnergy: { applicability: "not_applicable" } },
  drivers: [{ id: "alex", name: "Alex", paceDeltaSeconds: 0 }],
  variants: [{ id: "recorded-main", mode: "dry", driverOrderMode: "fixed", order: ["alex"], overrides: {} }],
  activeVariantId: "recorded-main",
};
const plan = { totalLaps: 4, total: 360, stops: 0, stints: [] } as unknown as StrategyOrbitCalculatedPlanV1;

describe("recordedRevisionPayload", () => {
  it("captures the exact recorded configuration, request and visible result", () => {
    const draft = { ...createRecordedWizardDraft(), name: "Imola", calculationMode: "dry" as const };
    const state = { status: "success" as const, input, result: { plans: { "recorded-main": plan }, comparisons: {} } };
    const payload = recordedRevisionPayload("event-1", draft, state);

    expect(payload).toEqual({
      contractVersion: "strategy.orbit.revision.v1",
      event: { id: "event-1", recorded: { contractVersion: "strategy.recorded.draft.v1", eventId: "event-1", draft } },
      variant: input.variants[0], calculationInput: input, calculatedPlan: plan,
    });
    expect(payload.calculationInput).not.toBe(input);
    expect(payload.calculatedPlan).not.toBe(plan);
  });

  it("rejects a response without its active plan", () => {
    expect(() => recordedRevisionPayload("event-1", createRecordedWizardDraft(), {
      status: "success", input, result: { plans: {}, comparisons: {} },
    })).toThrow("recorded_result_unavailable");
  });
});
