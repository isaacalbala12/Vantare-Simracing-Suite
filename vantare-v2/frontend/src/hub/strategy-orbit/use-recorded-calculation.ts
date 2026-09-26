import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StrategyApplicationClient, StrategyOrbitCalculationInputV1, StrategyOrbitCalculationResultV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { assessManualCalculation, assessRecordedCalculation, type RecordedCalculationCoverage } from "./strategy-recorded-calculation";
import { prepareRecordedPlanningInputs } from "./strategy-recorded-planning-inputs";
import { recordedPitComparisonInput, type RecordedPitConstraint } from "./strategy-recorded-pit-constraints";
import { recordedStintComparisonInput, type RecordedStintConstraint } from "./strategy-recorded-stint-constraints";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

export type RecordedCalculationState =
  | { readonly status: "idle" | "preparing" | "calculating" | "cancelling" | "cancelled" }
  | { readonly status: "partial"; readonly coverage: RecordedCalculationCoverage }
  | { readonly status: "success"; readonly input: StrategyOrbitCalculationInputV1; readonly result: StrategyOrbitCalculationResultV1 }
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
  const state: RecordedCalculationState = useMemo(() => storedState.status === "idle" || storedState.key === calculationKey
    ? storedState : { status: "idle" }, [calculationKey, storedState]);

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

  const executeInput = useCallback(async (input: StrategyOrbitCalculationInputV1, current: number) => {
    const calculateId = `recorded-calculate-${globalThis.crypto.randomUUID()}`;
    active.current = calculateId;
    setState({ status: "calculating", key: calculationKey });
    const result = await application.execute({
      protocolVersion: "strategy.application.v1", commandId: calculateId, operation: "calculate_orbit",
      expectedRepositoryVersion: repositoryVersion!, input,
    });
    if (current !== generation.current) return;
    if (cancelRequested.current) {
      cancelRequested.current = false;
      active.current = undefined;
      setState({ status: "cancelled", key: calculationKey });
      return;
    }
    if (!result.orbitCalculation?.plans[input.activeVariantId]) throw new Error("Strategy calculation result is missing its active plan");
    active.current = undefined;
    setState({ status: "success", key: calculationKey, input, result: result.orbitCalculation });
  }, [application, calculationKey, repositoryVersion]);

  const publishError = useCallback((error: unknown, current: number) => {
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
  }, [calculationKey]);

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
      if (draft.mode === "manual" && draft.sessions.length === 0) {
        const assessed = assessManualCalculation(draft);
        if (assessed.status === "partial") { active.current = undefined; setState({ status: "partial", key: calculationKey, coverage: assessed.coverage }); return; }
        await executeInput(assessed.input, current);
        return;
      }
      const planning = await prepareRecordedPlanningInputs(
        application as StrategyApplicationClient<unknown>, draft, repositoryVersion, prepareId, new Date().toISOString(),
      );
      if (current !== generation.current) return;
      if (cancelRequested.current) {
        cancelRequested.current = false;
        active.current = undefined;
        setState({ status: "cancelled", key: calculationKey });
        return;
      }
      const assessed = assessRecordedCalculation(draft, planning);
      if (assessed.status === "partial") {
        active.current = undefined;
        setState({ status: "partial", key: calculationKey, coverage: assessed.coverage });
        return;
      }
      await executeInput(assessed.input, current);
    } catch (error) {
      publishError(error, current);
    }
  }, [application, calculationKey, draft, executeInput, publishError, repositoryVersion]);

  const recalculateStints = useCallback(async (constraints: readonly RecordedStintConstraint[]) => {
    if (repositoryVersion === undefined || state.status !== "success") return;
    const current = ++generation.current;
    cancelRequested.current = false;
    if (active.current) application.cancel(active.current);
    try {
      await executeInput(recordedStintComparisonInput(state, constraints), current);
    } catch (error) {
      publishError(error, current);
    }
  }, [application, executeInput, publishError, repositoryVersion, state]);

  const recalculatePits = useCallback(async (constraints: readonly RecordedPitConstraint[]) => {
    if (repositoryVersion === undefined || state.status !== "success") return;
    const current = ++generation.current;
    cancelRequested.current = false;
    if (active.current) application.cancel(active.current);
    try {
      await executeInput(recordedPitComparisonInput(state, constraints), current);
    } catch (error) {
      publishError(error, current);
    }
  }, [application, executeInput, publishError, repositoryVersion, state]);

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

  return { state, calculate, recalculateStints, recalculatePits, cancel };
}
