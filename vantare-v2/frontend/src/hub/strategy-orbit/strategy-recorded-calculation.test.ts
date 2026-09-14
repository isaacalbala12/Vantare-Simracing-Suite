import { describe, expect, it } from "vitest";
import { recordedCalculationEvent } from "./strategy-recorded-calculation";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";

const tyre = (id: string) => ({
  id, compound: "medium" as const, origin: "event_allocation" as const,
  condition: { minimumRemainingPercent: 90, maximumRemainingPercent: 100, provenance: { kind: "range" as const, sourceId: "telemetry" }, confidence: { level: "high" as const, basis: "recorded" } },
  state: "free" as const, stints: 0,
});

function draft(patch: Partial<RecordedWizardDraft> = {}): RecordedWizardDraft {
  return {
    ...createRecordedWizardDraft(),
    race: { format: "timed", durationMin: 120 },
    tankLiters: 100,
    pitLossSeconds: 32,
    virtualEnergy: { applicability: "not_applicable" },
    ...patch,
  };
}

describe("recordedCalculationEvent", () => {
  it("maps the exact timed event and preserves zero initial loads and reserves", () => {
    const source = draft({
      initialFuelLiters: 0,
      fuelReserveLiters: 0,
      virtualEnergy: { applicability: "applicable", capacityPercent: 80, initialPercent: 0, reservePercent: 0 },
      rules: { minPitStops: 1 },
    });

    expect(recordedCalculationEvent(source)).toEqual({
      raceKind: "time",
      durationMinutes: 120,
      tankLiters: 100,
      initialFuelLiters: 0,
      fuelReserveLiters: 0,
      virtualEnergy: { applicability: "applicable", capacityPercent: 80, initialPercent: 0, reservePercent: 0 },
      pitLossSeconds: 32,
      rules: { minPitStops: 1 },
    });
  });

  it("maps a lap horizon and strips dormant virtual-energy values when it is not applicable", () => {
    const source = draft({
      race: { format: "laps", laps: 42 },
      virtualEnergy: { applicability: "not_applicable", capacityPercent: 100, initialPercent: 50, reservePercent: 10 },
    });

    expect(recordedCalculationEvent(source)).toEqual({
      raceKind: "laps",
      targetLaps: 42,
      durationMinutes: 0,
      tankLiters: 100,
      virtualEnergy: { applicability: "not_applicable" },
      pitLossSeconds: 32,
    });
  });

  it.each([
    ["missing race horizon", { race: { format: "timed" } }],
    ["missing tank", { tankLiters: undefined }],
    ["missing pit loss", { pitLossSeconds: undefined }],
    ["unknown virtual energy", { virtualEnergy: { applicability: "unknown" } }],
    ["missing virtual-energy reserve", { virtualEnergy: { applicability: "applicable", capacityPercent: 80 } }],
    ["invalid fuel relation", { initialFuelLiters: 101 }],
  ] satisfies readonly [string, Partial<RecordedWizardDraft>][]) ("rejects %s", (_name, patch) => {
    expect(() => recordedCalculationEvent(draft(patch))).toThrow(/recorded calculation event/i);
  });

  it("does not mutate the draft and omits absent optional fuel values", () => {
    const source = draft();
    const before = structuredClone(source);

    const event = recordedCalculationEvent(source);

    expect(source).toEqual(before);
    expect(event).not.toHaveProperty("initialFuelLiters");
    expect(event).not.toHaveProperty("fuelReserveLiters");
  });

  it("clones explicit physical tyre inputs without changing their values", () => {
    const tyreInventory = { maximum: 4, tyres: [tyre("M-FL"), tyre("M-FR"), tyre("M-RL"), tyre("M-RR")] };
    const compoundPace = [{ compound: "medium" as const, presence: "valid" as const, provenance: { kind: "reference" as const, sourceId: "revision-1" }, confidence: { sampleSize: 12, computationVersion: "analysis.v1" }, paceDeltaSeconds: 0, degradationPerLapSeconds: 0, curve: [{ lapInStint: 2, deltaSeconds: 0.1 }] }];
    const source = draft({ tyreInventory, compoundPace });

    const event = recordedCalculationEvent(source);

    expect(event).toMatchObject({ tyreInventory, compoundPace });
    expect(event.tyreInventory).not.toBe(tyreInventory);
    expect(event.compoundPace).not.toBe(compoundPace);
  });
});
