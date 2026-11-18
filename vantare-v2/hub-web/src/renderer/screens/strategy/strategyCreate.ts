import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

export function strategyCreate(
  act: ReturnType<typeof useStrategy>["act"],
  { fields, inputs }: StrategyComputeForm,
) {
  // v63 compatibility boundary. E4-datos adds inputs to this request.
  return act({
    method: "strategy.create",
    fields,
    basePaceSeconds: inputs.basePaceSeconds,
    fuelPerLapLiters: inputs.fuelPerLapLiters,
  });
}
