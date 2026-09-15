import type { StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import { STRATEGY_COMPOUNDS, type StrategyCompound } from "../../strategy/strategy-tyre";
import { currentRecordedPlan } from "./strategy-recorded-result";
import type { RecordedCalculationState } from "./use-recorded-calculation";

export const RECORDED_PIT_EDIT_VARIANT_ID = "recorded-pit-edit";

export type RecordedPitConstraint = {
  readonly index: number;
  readonly fuelLiters?: number;
  readonly vePercent?: number;
  readonly changeTyres?: boolean;
  readonly compound?: StrategyCompound;
};

function invalid(): never {
  throw new Error("Recorded pit constraints are invalid");
}

export function recordedPitComparisonInput(
  state: RecordedCalculationState,
  constraints: readonly RecordedPitConstraint[],
): StrategyOrbitCalculationInputV1 {
  if (state.status !== "success" || state.input.activeVariantId === RECORDED_PIT_EDIT_VARIANT_ID) invalid();
  const plan = currentRecordedPlan(state);
  const base = state.input.variants.find(variant => variant.id === state.input.activeVariantId);
  if (!plan || !base || constraints.length !== plan.stopDetails.length) invalid();

  const pitOverrides: Record<number, Omit<RecordedPitConstraint, "index">> = {};
  const seen = new Set<number>();
  for (const constraint of constraints) {
    if (!Number.isSafeInteger(constraint.index) || constraint.index < 0 || constraint.index >= plan.stopDetails.length || seen.has(constraint.index)) invalid();
    for (const value of [constraint.fuelLiters, constraint.vePercent]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) invalid();
    }
    const stop = plan.stopDetails[constraint.index];
    const fuelLiters = constraint.fuelLiters ?? stop.fuelOutLiters - stop.fuelInLiters;
    const vePercent = constraint.vePercent ?? (stop.virtualEnergyInPercent === undefined || stop.virtualEnergyOutPercent === undefined
      ? undefined : stop.virtualEnergyOutPercent - stop.virtualEnergyInPercent);
    const changeTyres = constraint.changeTyres ?? stop.changeTyres;
    const compound = constraint.compound ?? stop.compound;
    if (!Number.isFinite(fuelLiters) || fuelLiters < 0) invalid();
    if (state.input.event.virtualEnergy?.applicability === "applicable" && vePercent === undefined) invalid();
    if (vePercent !== undefined && state.input.event.virtualEnergy?.applicability !== "applicable") invalid();
    if ((changeTyres !== undefined || compound !== undefined) && !state.input.event.tyreInventory) invalid();
    if (compound !== undefined && !STRATEGY_COMPOUNDS.includes(compound)) invalid();
    if (constraint.changeTyres === false && compound !== undefined && compound !== plan.stints[constraint.index + 1]?.compound) invalid();
    seen.add(constraint.index);
    pitOverrides[constraint.index] = {
      fuelLiters,
      ...(vePercent === undefined ? {} : { vePercent }),
      ...(changeTyres === undefined ? {} : { changeTyres }),
      ...(compound === undefined ? {} : { compound }),
    };
  }

  const overrides = Object.fromEntries(plan.stints.map((stint, index) => [index, {
    ...base.overrides[index], laps: stint.laps,
  }]));
  const constrained = {
    ...structuredClone(base), id: RECORDED_PIT_EDIT_VARIANT_ID,
    driverOrderMode: "fixed" as const,
    order: plan.stints.map(stint => stint.d),
    overrides,
    pitOverrides,
  };
  return { ...structuredClone(state.input), variants: [structuredClone(base), constrained], activeVariantId: constrained.id };
}
