import type {
  StrategyComputeForm,
  StrategyPlanView,
} from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

type Act = ReturnType<typeof useStrategy>["act"];

// The only places where a calculation is started and cancelled. Starting sends
// the whole form (the 13 `fields` and the 15 `inputs`), the same one
// `strategy.confirm` sends; the host answers `calculating` and the end of the
// calculation arrives later through the view.
export function strategyCompute(
  act: Act,
  eventId: string,
  strategyId: string,
  form: StrategyComputeForm,
) {
  return act({ method: "strategy.compute", eventId, strategyId, form });
}

export function strategyCancel(act: Act, plan: StrategyPlanView) {
  return plan.computeId === null
    ? undefined
    : act({ method: "strategy.cancel", computeId: plan.computeId });
}
