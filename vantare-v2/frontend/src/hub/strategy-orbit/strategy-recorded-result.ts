import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { RECORDED_DRAFT_VERSION, type RecordedDraftPayload } from "./strategy-recorded-payload";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import type { RecordedCalculationState } from "./use-recorded-calculation";
import {
  STRATEGY_ORBIT_REVISION_CONTRACT_V1,
  type StrategyOrbitRevisionPayloadV1,
} from "./strategy-orbit-lifecycle";

export function currentRecordedPlan(state: RecordedCalculationState): StrategyOrbitCalculatedPlanV1 | undefined {
  if (state.status !== "success") return undefined;
  return state.result.plans[state.input.activeVariantId];
}

/** Captures the exact request and response; acceptance never prepares telemetry again. */
export function recordedRevisionPayload(
  eventId: string,
  draft: RecordedWizardDraft,
  state: RecordedCalculationState,
): StrategyOrbitRevisionPayloadV1 {
  const plan = currentRecordedPlan(state);
  if (state.status !== "success" || !plan) throw new Error("recorded_result_unavailable");
  const variant = state.input.variants.find(candidate => candidate.id === state.input.activeVariantId);
  if (!variant) throw new Error("recorded_variant_unavailable");
  const recorded: RecordedDraftPayload = {
    contractVersion: RECORDED_DRAFT_VERSION,
    eventId,
    draft: structuredClone(draft),
  };
  const event = { id: eventId, recorded } as object & { readonly id: string };
  return {
    contractVersion: STRATEGY_ORBIT_REVISION_CONTRACT_V1,
    event,
    variant: structuredClone(variant),
    calculationInput: structuredClone(state.input),
    calculatedPlan: structuredClone(plan),
  };
}
