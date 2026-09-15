import type { StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import type { RecordedCalculationState } from "./use-recorded-calculation";

export const RECORDED_STINT_EDIT_VARIANT_ID = "recorded-stint-edit";

export type RecordedStintConstraint = {
  readonly index: number;
  readonly driverId?: string;
  readonly laps?: number;
};

/** Builds one comparable constrained variant from the exact visible base plan. */
export function recordedStintComparisonInput(
  state: RecordedCalculationState,
  constraints: readonly RecordedStintConstraint[],
): StrategyOrbitCalculationInputV1 {
  if (state.status !== "success" || constraints.length === 0) invalid();
  const base = state.input.variants.find(variant => variant.id === "recorded-main");
  const plan = state.result.plans["recorded-main"];
  if (!base || !plan || plan.stints.length === 0) invalid();

  const drivers = new Set(state.input.drivers.map(driver => driver.id));
  const order = plan.stints.map(stint => stint.d);
  if (order.some(driverId => !drivers.has(driverId))) invalid();
  const overrides: Record<number, { laps?: number }> = {};
  const seen = new Set<number>();
  let changed = false;

  for (const constraint of constraints) {
    if (!Number.isSafeInteger(constraint.index) || constraint.index < 0 || constraint.index >= plan.stints.length || seen.has(constraint.index)) invalid();
    seen.add(constraint.index);
    const stint = plan.stints[constraint.index];
    if (constraint.driverId !== undefined) {
      if (!drivers.has(constraint.driverId)) invalid();
      changed ||= constraint.driverId !== stint.d;
      order[constraint.index] = constraint.driverId;
    }
    if (constraint.laps !== undefined) {
      if (!Number.isSafeInteger(constraint.laps) || constraint.laps <= 0) invalid();
      changed ||= constraint.laps !== stint.laps;
      overrides[constraint.index] = { laps: constraint.laps };
    }
  }
  if (!changed) invalid();

  const constrained = {
    ...structuredClone(base),
    id: RECORDED_STINT_EDIT_VARIANT_ID,
    driverOrderMode: "fixed" as const,
    order,
    overrides,
  };
  return {
    ...structuredClone(state.input),
    variants: [structuredClone(base), constrained],
    activeVariantId: RECORDED_STINT_EDIT_VARIANT_ID,
  };
}

function invalid(): never {
  throw new Error("Invalid recorded stint constraints");
}
