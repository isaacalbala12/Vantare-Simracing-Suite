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
  climateBucket: "dry" | "humid" | "wet" = "dry",
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
  const derived = derivedInput(planning, field, climateBucket);
  if (derived) return derived;
  if (manualValue !== undefined && Number.isFinite(manualValue)) {
    return { kind: "manual", presence: "valid", value: manualValue, canRevert: false };
  }
  return { kind: "missing", presence: "missing", reason: missingReason(planning, field), canRevert: false };
}

/**
 * El modo Eco no es el modo Seco: su ritmo y su consumo solo se derivan si
 * existe la familia de ahorro. Antes se pintaba el dato de seco con la
 * etiqueta "Derivado", que es mentir dos veces: ni es eco ni se ha medido.
 * Sin ahorro medido se cae al valor manual del documento, y si tampoco lo hay
 * se declara ausente con la causa que da la familia.
 */
export function strategyEcoProvenance(
  planning: StrategyPlanningInputsV2 | undefined,
  field: "base_pace_seconds" | "fuel_per_lap_liters",
  manualValue?: number,
): StrategyInputProvenanceView {
  const dry = strategyInputProvenance(planning, field, undefined, "dry");
  const savingField = field === "base_pace_seconds" ? "saving_time_cost_per_lap" : "saving_fuel_per_lap";
  const saving = strategyInputProvenance(planning, savingField, undefined);
  if (dry.value !== undefined && saving.value !== undefined && dry.kind !== "missing" && saving.kind !== "missing") {
    const value = field === "base_pace_seconds" ? dry.value + saving.value : dry.value - saving.value;
    if (Number.isFinite(value) && value > 0) {
      return { kind: "derived", presence: "valid", value, confidence: saving.confidence, canRevert: false };
    }
  }
  if (manualValue !== undefined && Number.isFinite(manualValue)) {
    return { kind: "manual", presence: "valid", value: manualValue, canRevert: false };
  }
  return { kind: "missing", presence: "missing", reason: saving.reason ?? dry.reason, canRevert: false };
}

function derivedInput(
  planning: StrategyPlanningInputsV2 | undefined,
  field: StrategyPlanningInputFieldV2,
  climateBucket: "dry" | "humid" | "wet",
): StrategyInputProvenanceView | undefined {
  const projection = planning?.projection;
  if (!projection) return undefined;
  switch (field) {
    case "fuel_per_lap_liters":
      return familyValue(
        projection.fuelConsumption,
        projection.fuelConsumption.byClimateBucket?.[climateBucket],
        "missing_fuel_consumption_for_climate_bucket",
      );
    case "ve_per_lap_percent":
      return familyValue(
        projection.virtualEnergyConsumption,
        projection.virtualEnergyConsumption.byClimateBucket?.[climateBucket],
        "missing_virtual_energy_consumption_for_climate_bucket",
      );
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
    case "base_pace_seconds": {
      const pace = projection.representativePaceByClimateBucket?.[climateBucket];
      return pace
        ? familyValue(pace, pace.medianLapSeconds)
        : familyValue(projection.combinedStintPaceCurve, undefined, "missing_representative_pace");
    }
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
    presence: usable ? "valid" : family.presence === "valid" ? "missing" : family.presence,
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
