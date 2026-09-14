import { describe, expect, it } from "vitest";
import { recordedCalculationDriverDeltas, recordedCalculationEvent, recordedCalculationVariant } from "./strategy-recorded-calculation";
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
      rules: { minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }, { fromLap: 30, toLap: 40 }], mandatoryCompounds: ["hard", "wet"], allowedCompoundsByClimate: { dry: ["hard", "wet"], wet: ["soft"] }, driverLimits: { driver: { minLaps: 12, maxLaps: 40, maxContinuousTimeSeconds: 1800, maxTotalTimeSeconds: 5400, unavailable: [{ fromLap: 4, toLap: 4 }, { fromLap: 20, toLap: 25 }] } } },
    });

    expect(recordedCalculationEvent(source)).toEqual({
      raceKind: "time",
      durationMinutes: 120,
      tankLiters: 100,
      initialFuelLiters: 0,
      fuelReserveLiters: 0,
      virtualEnergy: { applicability: "applicable", capacityPercent: 80, initialPercent: 0, reservePercent: 0 },
      pitLossSeconds: 32,
      rules: { minPitStops: 1, requiredWindows: [{ fromLap: 10, toLap: 20 }, { fromLap: 30, toLap: 40 }], mandatoryCompounds: ["hard", "wet"], allowedCompoundsByClimate: { dry: ["hard", "wet"], wet: ["soft"] }, driverLimits: { driver: { minLaps: 12, maxLaps: 40, maxContinuousTimeSeconds: 1800, maxTotalTimeSeconds: 5400, unavailable: [{ fromLap: 4, toLap: 4 }, { fromLap: 20, toLap: 25 }] } } },
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
    expect(event).not.toHaveProperty("pitServices");
    expect(event).not.toHaveProperty("formationSeconds");
  });

  it("copies explicit pit services and zero formation without aliasing", () => {
    const pitServices = { transitSeconds: 20, refuelRateLPerS: 2, veRatePPerS: 3, tyreSeconds: 8, serviceMode: "sequential" as const };
    const source = draft({ pitServices, formationSeconds: 0 });

    const event = recordedCalculationEvent(source);

    expect(event).toMatchObject({ pitServices, formationSeconds: 0 });
    expect(event.pitServices).not.toBe(pitServices);
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

describe("recordedCalculationVariant", () => {
  const drivers = [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }];

  it("maps an explicit fixed sequence without calculating presentation values", () => {
    const source = draft({
      race: { format: "timed", durationMin: 120 },
      drivers,
      driverOrder: { mode: "fixed", ids: ["sam", "alex"] },
    });

    expect(recordedCalculationVariant(source, "wet")).toEqual({
      id: "recorded-main",
      mode: "wet",
      driverOrderMode: "fixed",
      order: ["sam", "alex"],
      overrides: {},
    });
  });

  it("uses the legacy driver order as a fixed sequence without mutating the draft", () => {
    const source = draft({ drivers });
    const before = structuredClone(source);

    expect(recordedCalculationVariant(source, "dry").order).toEqual(["alex", "sam"]);
    expect(source).toEqual(before);
  });

  it("maps unique free candidates for a lap race", () => {
    const source = draft({
      race: { format: "laps", laps: 50 },
      drivers,
      driverOrder: { mode: "free", ids: ["alex", "sam"] },
    });

    expect(recordedCalculationVariant(source, "eco")).toMatchObject({
      mode: "eco",
      driverOrderMode: "free",
      order: ["alex", "sam"],
    });
  });

  it("maps unique free candidates for a timed race", () => {
    const source = draft({ drivers, driverOrder: { mode: "free", ids: ["alex", "sam"] } });
    expect(recordedCalculationVariant(source, "dry")).toMatchObject({
      driverOrderMode: "free",
      order: ["alex", "sam"],
    });
  });

  it.each([
    ["duplicate", { race: { format: "laps", laps: 50 }, drivers, driverOrder: { mode: "free", ids: ["alex", "alex"] } }],
    ["foreign", { race: { format: "laps", laps: 50 }, drivers, driverOrder: { mode: "fixed", ids: ["alex", "other"] } }],
    ["missing", { race: { format: "laps", laps: 50 }, drivers, driverOrder: { mode: "fixed", ids: ["alex"] } }],
  ] satisfies readonly [string, Partial<RecordedWizardDraft>][]) ("rejects %s driver order", (_name, patch) => {
    expect(() => recordedCalculationVariant(draft(patch), "dry")).toThrow(/recorded calculation variant/i);
  });
});

describe("recordedCalculationDriverDeltas", () => {
  it("resolves reference chains into one additive delta per driver", () => {
    const source = draft({ drivers: [
      { id: "alex", name: "Alex" },
      { id: "sam", name: "Sam", referenceDriverId: "alex", paceDeltaSeconds: 2 },
      { id: "lee", name: "Lee", referenceDriverId: "sam", paceDeltaSeconds: -0.5 },
    ] });

    expect(recordedCalculationDriverDeltas(source)).toEqual({ alex: 0, sam: 2, lee: 1.5 });
  });

  it.each([
    ["missing reference", [{ id: "alex", name: "Alex", referenceDriverId: "missing", paceDeltaSeconds: 1 }]],
    ["cycle", [{ id: "alex", name: "Alex", referenceDriverId: "sam", paceDeltaSeconds: 1 }, { id: "sam", name: "Sam", referenceDriverId: "alex", paceDeltaSeconds: 1 }]],
    ["non-finite", [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam", referenceDriverId: "alex", paceDeltaSeconds: Infinity }]],
  ] as const)("rejects %s", (_name, drivers) => {
    expect(() => recordedCalculationDriverDeltas(draft({ drivers }))).toThrow(/driver delta/i);
  });
});
