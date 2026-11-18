import type { StrategyComputeForm } from "../../../contract/generated/strategy";
import type { useStrategy } from "./useStrategy";

export function strategyCreate(
  act: ReturnType<typeof useStrategy>["act"],
  { fields, inputs }: StrategyComputeForm,
) {
  // The request now takes the 15 `inputs` (E4-datos), which replace the loose pace
  // and consumption; this boundary keeps sending the pair until the wizard sends them.
  return act({
    method: "strategy.create",
    fields,
    basePaceSeconds: inputs.basePaceSeconds,
    fuelPerLapLiters: inputs.fuelPerLapLiters,
    inputs: null,
  });
}
