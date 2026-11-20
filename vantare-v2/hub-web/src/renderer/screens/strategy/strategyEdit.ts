import type { StrategyPlanView } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

type Act = ReturnType<typeof useStrategy>["act"];

// The only places where the schedule of a plan is moved, recalculated or reset.
// Each one names the plan it acts on by its computeId (the host answers
// `strategyConflict` for any other) and the hook adds the revision. A plan with
// no computeId has nothing to edit: no request is made.
export function strategyMoveBoundary(
  act: Act,
  plan: StrategyPlanView,
  index: number,
  lap: number,
) {
  return plan.computeId === null
    ? undefined
    : act({
        method: "strategy.moveBoundary",
        computeId: plan.computeId,
        index,
        lap,
      });
}

export function strategyMoveStop(
  act: Act,
  plan: StrategyPlanView,
  index: number,
  delta: -1 | 1,
) {
  return plan.computeId === null
    ? undefined
    : act({
        method: "strategy.moveStop",
        computeId: plan.computeId,
        index,
        delta,
      });
}

export function strategyRecalculate(act: Act, plan: StrategyPlanView) {
  return plan.computeId === null
    ? undefined
    : act({ method: "strategy.recalculate", computeId: plan.computeId });
}

export function strategyResetEdit(act: Act, plan: StrategyPlanView) {
  return plan.computeId === null
    ? undefined
    : act({ method: "strategy.resetEdit", computeId: plan.computeId });
}

// Fixing by hand what a stop does. The request says how the whole stop stays:
// both amounts and the tyres, and `null` for what the calculation decides. The
// host validates at once and, if it refuses an amount, changes nothing. This
// screen fixes amounts only: the tyres go back as the host has them.
export function strategySetStopService(
  act: Act,
  plan: StrategyPlanView,
  index: number,
  fuelLiters: number | null,
  vePercent: number | null,
) {
  return plan.computeId === null
    ? undefined
    : act({
        method: "strategy.setStopService",
        computeId: plan.computeId,
        index,
        fuelLiters,
        vePercent,
        changeTyres: plan.edit?.stops[index]?.fixed.changeTyres ?? null,
      });
}

export function strategyClearStopServices(act: Act, plan: StrategyPlanView) {
  return plan.computeId === null
    ? undefined
    : act({ method: "strategy.clearStopServices", computeId: plan.computeId });
}
