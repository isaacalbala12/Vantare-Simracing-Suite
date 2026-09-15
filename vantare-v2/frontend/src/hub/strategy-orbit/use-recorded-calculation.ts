import { useCallback, useEffect, useRef, useState } from "react";
import type { StrategyApplicationClient, StrategyOrbitCalculationResultV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { recordedCalculationInput } from "./strategy-recorded-calculation";
import { prepareRecordedPlanningInputs } from "./strategy-recorded-planning-inputs";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

export type RecordedCalculationState =
  | { readonly status: "idle" | "preparing" | "calculating" | "cancelling" | "cancelled" }
  | { readonly status: "success"; readonly result: StrategyOrbitCalculationResultV1 }
  | { readonly status: "error"; readonly message: string; readonly code?: string; readonly field?: string };

export function useRecordedCalculation(
  draft: RecordedWizardDraft,
  repositoryVersion: number | undefined,
  application: StrategyApplicationClient<RecordedDraftPayload>,
) {
  const calculationKey = JSON.stringify([repositoryVersion, draft]);
  const [storedState, setState] = useState<RecordedCalculationState & { readonly key?: string }>({ status: "idle" });
  const generation = useRef(0);
  const active = useRef<string | undefined>(undefined);
  const cancelRequested = useRef(false);

  useEffect(() => {
    generation.current += 1;
    if (active.current) application.cancel(active.current);
    active.current = undefined;
    cancelRequested.current = false;
    return () => {
      generation.current += 1;
      if (active.current) application.cancel(active.current);
      active.current = undefined;
    };
  }, [application, draft, repositoryVersion]);

  const calculate = useCallback(async () => {
    if (repositoryVersion === undefined || !Number.isSafeInteger(repositoryVersion) || repositoryVersion < 0) {
      setState({ status: "error", key: calculationKey, message: "Recorded calculation repository is unavailable" });
      return;
    }
    const current = ++generation.current;
    cancelRequested.current = false;
    if (active.current) application.cancel(active.current);
    const prepareId = `recorded-prepare-${globalThis.crypto.randomUUID()}`;
    active.current = prepareId;
    setState({ status: "preparing", key: calculationKey });
    try {
      const planning = await prepareRecordedPlanningInputs(
        application as StrategyApplicationClient<unknown>, draft, repositoryVersion, prepareId, new Date().toISOString(),
      );
      if (current !== generation.current) return;
      const input = recordedCalculationInput(draft, planning);
      const calculateId = `recorded-calculate-${globalThis.crypto.randomUUID()}`;
      active.current = calculateId;
      setState({ status: "calculating", key: calculationKey });
      const result = await application.execute({
        protocolVersion: "strategy.application.v1", commandId: calculateId, operation: "calculate_orbit",
        expectedRepositoryVersion: repositoryVersion, input,
      });
      if (current !== generation.current) return;
      if (!result.orbitCalculation) throw new Error("Strategy calculation result is missing");
      active.current = undefined;
      setState({ status: "success", key: calculationKey, result: result.orbitCalculation });
    } catch (error) {
      if (current !== generation.current) return;
      active.current = undefined;
      const typed = error instanceof Error ? error : new Error(String(error));
      const metadata = typed as Error & { code?: string; field?: string };
      if (cancelRequested.current) {
        cancelRequested.current = false;
        setState({ status: "cancelled", key: calculationKey });
        return;
      }
      setState({
        status: "error", key: calculationKey, message: typed.message,
        ...(typeof metadata.code === "string" ? { code: metadata.code } : {}),
        ...(typeof metadata.field === "string" ? { field: metadata.field } : {}),
      });
    }
  }, [application, calculationKey, draft, repositoryVersion]);

  const cancel = useCallback(() => {
    if (!active.current) return;
    cancelRequested.current = true;
    setState({ status: "cancelling", key: calculationKey });
    if (!application.cancel(active.current)) {
      generation.current += 1;
      active.current = undefined;
      setState({ status: "cancelled", key: calculationKey });
    }
  }, [application, calculationKey]);

  const state: RecordedCalculationState = storedState.status === "idle" || storedState.key === calculationKey
    ? storedState : { status: "idle" };
  return { state, calculate, cancel };
}
