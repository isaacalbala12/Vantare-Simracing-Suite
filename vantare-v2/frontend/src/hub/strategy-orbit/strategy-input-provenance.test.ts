import { describe, expect, it } from "vitest";
import type { StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import { strategyInputProvenance } from "./strategy-input-provenance";

const confidence = { sampleSize: 18, rangeLower: 2.8, rangeUpper: 3.2, computationVersion: "producer.v1" };
const planning = {
  projection: {
    contractVersion: "strategyinputprojection.v2", generatedAt: "2026-08-22T12:00:00.000Z", computationVersion: "producer.v1",
    sourceSessions: ["race-1"], combinationId: "lmu:fuji",
    fuelConsumption: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence, meanPerLap: 3, rangeLower: 2.8, rangeUpper: 3.2 },
    virtualEnergyConsumption: { presence: "missing", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_virtual_energy_consumption", meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
    combinedStintPaceCurve: { presence: "missing", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_combined_stint_pace_curve", identifiability: "combined_only", points: [] },
    tyreDegradation: { presence: "missing", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_tyre_degradation" },
    pit: { presence: "missing", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" } },
    savingCost: { presence: "missing", provenance: { kind: "derived", sourceId: "aggregate:lmu:fuji" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_saving_cost" },
  },
  overrides: {},
} satisfies StrategyPlanningInputsV2;

describe("Strategy input provenance", () => {
  it("keeps the derived sample/range behind a manual override and reveals it on revert", () => {
    const derived = strategyInputProvenance(planning, "fuel_per_lap_liters", 2.7);
    const overridden: StrategyPlanningInputsV2 = { ...planning, overrides: { fuel_per_lap_liters: {
      value: 3.5, presence: "valid", provenance: { kind: "manual", sourceId: "orbit:event:fuel" },
      confidence: { sampleSize: 1, computationVersion: "orbit-input.v1" },
    } } };
    const manual = strategyInputProvenance(overridden, "fuel_per_lap_liters", 2.7);
    expect(derived).toMatchObject({ kind: "derived", value: 3, confidence });
    expect(manual).toMatchObject({ kind: "manual", value: 3.5, canRevert: true });
    expect(strategyInputProvenance({ ...overridden, overrides: {} }, "fuel_per_lap_liters", 2.7)).toEqual(derived);
  });

  it("reports an honest missing reason without turning it into zero", () => {
    expect(strategyInputProvenance(planning, "ve_per_lap_percent")).toMatchObject({
      kind: "missing", presence: "missing", reason: "missing_virtual_energy_consumption",
    });
  });
});
