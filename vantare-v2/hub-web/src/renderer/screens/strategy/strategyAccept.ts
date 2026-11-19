import type { StrategyPlanView } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

type Act = ReturnType<typeof useStrategy>["act"];

// The only places where the plan on view is accepted, removed or brought back.
// Accepting names the plan it keeps by its computeId (the host answers
// `strategyConflict` for any other) and the hook adds the revision. A plan with
// no computeId has nothing to accept: no request is made.
export function strategyAccept(act: Act, plan: StrategyPlanView) {
  return plan.computeId === null
    ? undefined
    : act({ method: "strategy.accept", computeId: plan.computeId });
}

export function strategyUnaccept(act: Act) {
  return act({ method: "strategy.unaccept" });
}

// Drops the proposal so that the accepted plan is what the screen shows.
export function strategyShowAccepted(act: Act) {
  return act({ method: "strategy.showAccepted" });
}
