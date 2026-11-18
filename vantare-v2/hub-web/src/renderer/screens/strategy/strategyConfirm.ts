import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

// The single place where the confirmation is sent: the 13 `fields` and the
// 15 `inputs` (v65 replaces the stored inputs as a whole and calculates nothing).
export function strategyConfirm(
  act: ReturnType<typeof useStrategy>["act"],
  eventId: string,
  strategyId: string,
  { fields, inputs }: StrategyComputeForm,
) {
  return act({
    method: "strategy.confirm",
    eventId,
    strategyId,
    fields,
    inputs,
  });
}
