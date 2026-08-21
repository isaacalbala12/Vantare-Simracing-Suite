import type {
  StrategyPlanningInputFieldV2,
  StrategyPlanningInputsV2,
  StrategyProjectionConfidenceV2,
} from "../../strategy/strategy-application-client";

export type StrategyInputProvenanceView = {
  readonly kind: "derived" | "manual" | "reference" | "missing";
  readonly presence: "valid" | "missing" | "invalid" | "stale" | "unsupported" | "unknown";
  readonly value?: number;
  readonly confidence?: StrategyProjectionConfidenceV2;
  readonly reason?: string;
  readonly canRevert: boolean;
};

export function strategyInputProvenance(
  planning: StrategyPlanningInputsV2 | undefined,
  field: StrategyPlanningInputFieldV2,
  manualValue?: number,
): StrategyInputProvenanceView {
  const override = planning?.overrides[field];
  if (override) {
    return {
      kind: override.provenance.kind,
      presence: override.presence,
      value: override.value,
      confidence: override.confidence,
      canRevert: Boolean(planning?.projection),
    };
  }
  const derived = derivedInput(planning, field);
  if (derived) return derived;
  if (manualValue !== undefined && Number.isFinite(manualValue)) {
    return { kind: "manual", presence: "valid", value: manualValue, canRevert: false };
  }
  return { kind: "missing", presence: "missing", reason: missingReason(planning, field), canRevert: false };
}

function derivedInput(
  planning: StrategyPlanningInputsV2 | undefined,
  field: StrategyPlanningInputFieldV2,
): StrategyInputProvenanceView | undefined {
  const projection = planning?.projection;
  if (!projection) return undefined;
  switch (field) {
    case "fuel_per_lap_liters":
      return familyValue(projection.fuelConsumption, projection.fuelConsumption.meanPerLap);
    case "ve_per_lap_percent":
      return familyValue(projection.virtualEnergyConsumption, projection.virtualEnergyConsumption.meanPerLap);
    case "tyre_life_laps":
      return familyValue(projection.tyreDegradation, projection.tyreDegradation.lifeLapsEstimate);
    case "saving_fuel_per_lap":
      return familyValue(projection.savingCost, projection.savingCost.levels?.[0]?.fuelSavedPerLap);
    case "saving_time_cost_per_lap":
      return familyValue(projection.savingCost, projection.savingCost.levels?.[0]?.timeCostPerLap);
    case "degradation_per_lap_seconds": {
      const curve = projection.tyreAgeCurve as { slopeSecondsPerUnit?: unknown } | undefined;
      return familyValue(projection.combinedStintPaceCurve, typeof curve?.slopeSecondsPerUnit === "number" ? curve.slopeSecondsPerUnit : undefined, "combined_only");
    }
    case "base_pace_seconds":
      return familyValue(projection.combinedStintPaceCurve, undefined, "missing_representative_pace");
    case "tank_liters":
    case "pit_loss_seconds":
      return undefined;
  }
}

function familyValue(
  family: { readonly presence: StrategyInputProvenanceView["presence"]; readonly provenance: { readonly kind: string }; readonly confidence: StrategyProjectionConfidenceV2; readonly reason?: string },
  value?: number,
  absentReason?: string,
): StrategyInputProvenanceView {
  const usable = family.presence === "valid" && value !== undefined && Number.isFinite(value);
  return {
    kind: usable && (family.provenance.kind === "reference" || family.provenance.kind === "manual")
      ? family.provenance.kind
      : usable ? "derived" : "missing",
    presence: usable ? "valid" : family.presence,
    ...(usable ? { value } : {}),
    confidence: family.confidence,
    reason: usable ? undefined : (family.reason || absentReason),
    canRevert: false,
  };
}

function missingReason(planning: StrategyPlanningInputsV2 | undefined, field: StrategyPlanningInputFieldV2): string {
  if (!planning?.projection) return "manual_input_required";
  return `missing_${field}`;
}
