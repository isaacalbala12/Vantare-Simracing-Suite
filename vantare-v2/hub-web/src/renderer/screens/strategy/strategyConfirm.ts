import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

export function strategyConfirm(
  act: ReturnType<typeof useStrategy>["act"],
  eventId: string,
  strategyId: string,
  form: StrategyComputeForm,
) {
  return act({
    method: "strategy.confirm",
    eventId,
    strategyId,
    fields: form.fields,
  });
}
