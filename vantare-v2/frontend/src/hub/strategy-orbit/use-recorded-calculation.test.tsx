import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1, StrategyOrbitCalculatedPlanV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { useRecordedCalculation } from "./use-recorded-calculation";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedPlan } from "./StrategyRecordedPlan";
import { recordedCalculationInput } from "./strategy-recorded-calculation";

const revision = { sessionId: "race", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) };
const draft: RecordedWizardDraft = {
  ...createRecordedWizardDraft(), calculationMode: "dry",
  combination: { combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" },
  race: { format: "laps", laps: 4 }, tankLiters: 10, pitLossSeconds: 20,
  virtualEnergy: { applicability: "not_applicable" },
  drivers: [{ id: "alex", name: "Alex" }], driverOrder: { mode: "fixed", ids: ["alex"] }, sessions: [revision],
};
const family = { presence: "missing" as const, provenance: { kind: "derived" as const, sourceId: "race" }, confidence: { sampleSize: 0, computationVersion: "test.v1" } };
function planning(generatedAt: string, withDry = true): StrategyPlanningInputsV2 {
  return { projection: {
    contractVersion: "strategyinputprojection.v2", generatedAt, computationVersion: "test.v1", sourceSessions: ["race"], sourceRevisions: [revision], combinationId: "combo",
    fuelConsumption: { ...family, presence: "valid", meanPerLap: 2, rangeLower: 1.8, rangeUpper: 2.2 },
    virtualEnergyConsumption: { ...family, meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
    ...(withDry ? { representativePaceByClimateBucket: { dry: { ...family, presence: "valid" as const, medianLapSeconds: 90 } } } : {}),
    combinedStintPaceCurve: { ...family, identifiability: "combined_only", points: [] }, tyreDegradation: family, pit: family, savingCost: family,
  }, overrides: {} };
}
function result(command: StrategyApplicationCommandV1<RecordedDraftPayload>, extra: Partial<StrategyApplicationResultV1<RecordedDraftPayload>> = {}): StrategyApplicationResultV1<RecordedDraftPayload> {
  return { protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 7, recoveredFromBackup: false, closed: false, ...extra };
}

describe("useRecordedCalculation", () => {
  it("prepares the exact revisions and dispatches one current calculation", async () => {
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => command.operation === "get_revision_planning_inputs"
      ? result(command, { planningInputStatus: "available", planningInputs: planning(command.generatedAt) })
      : result(command, { orbitCalculation: { plans: { "recorded-main": {} as never }, comparisons: {} } }));
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));

    await act(() => hook.current.calculate());

    expect(hook.current.state.status).toBe("success");
    expect(hook.current.state).toMatchObject({ status: "success", input: { activeVariantId: "recorded-main" } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toMatchObject({ operation: "get_revision_planning_inputs", expectedRepositoryVersion: 7, combinationId: "combo", sourceRevisions: [revision] });
    expect(execute.mock.calls[1][0]).toMatchObject({ operation: "calculate_orbit", expectedRepositoryVersion: 7, input: { activeVariantId: "recorded-main", drivers: [{ id: "alex", name: "Alex", paceDeltaSeconds: 0 }] } });
  });

  it("cancels the active native command and ends in a distinct cancelled state", async () => {
    let reject!: (error: Error) => void;
    const execute = vi.fn(() => new Promise<StrategyApplicationResultV1<RecordedDraftPayload>>((_resolve, fail) => { reject = fail; }));
    const cancel = vi.fn(() => { reject(new Error("cancelled")); return true; });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel, dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));
    act(() => { void hook.current.calculate(); });
    await waitFor(() => expect(hook.current.state.status).toBe("preparing"));
    act(() => hook.current.cancel());
    expect(hook.current.state.status).toBe("cancelling");
    await waitFor(() => expect(hook.current.state.status).toBe("cancelled"));
    expect(cancel).toHaveBeenCalledWith(expect.stringMatching(/^recorded-prepare-/));
  });

  it("discards a late preparation response after the draft changes", async () => {
    let resolve!: (value: StrategyApplicationResultV1<RecordedDraftPayload>) => void;
    let pendingCommand!: StrategyApplicationCommandV1<RecordedDraftPayload>;
    const execute = vi.fn((command: StrategyApplicationCommandV1<RecordedDraftPayload>) => { pendingCommand = command; return new Promise<StrategyApplicationResultV1<RecordedDraftPayload>>(done => { resolve = done; }); });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => false), dispose: vi.fn() };
    const { result: hook, rerender } = renderHook(({ value }) => useRecordedCalculation(value, 7, application), { initialProps: { value: draft } });
    act(() => { void hook.current.calculate(); });
    await waitFor(() => expect(hook.current.state.status).toBe("preparing"));
    rerender({ value: { ...draft, name: "Changed" } });
    act(() => resolve(result(pendingCommand, { planningInputStatus: "available", planningInputs: planning((pendingCommand as Extract<typeof pendingCommand, { operation: "get_revision_planning_inputs" }>).generatedAt) })));
    await waitFor(() => expect(hook.current.state.status).toBe("idle"));
    expect(execute).toHaveBeenCalledOnce();
  });

  it("publishes backed values as partial coverage without dispatching a plan", async () => {
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => result(command, { planningInputStatus: "available", planningInputs: planning((command as Extract<typeof command, { operation: "get_revision_planning_inputs" }>).generatedAt, false) }));
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => false), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));
    await act(() => hook.current.calculate());
    expect(hook.current.state).toMatchObject({ status: "partial", coverage: {
      fuelLitersPerLap: 2, virtualEnergyApplicable: false, blockers: ["pace"],
    } });
    expect(execute).toHaveBeenCalledOnce();
  });
});

it("requires an explicit supported condition and exposes cancel while running", () => {
  const onChange = vi.fn(), onCalculate = vi.fn(), onCancel = vi.fn();
  const acceptance = { state: { status: "idle" as const }, accept: vi.fn(), resolve: vi.fn(), retry: vi.fn(), dismiss: vi.fn() };
  const view = render(<StrategyRecordedPlan acceptance={acceptance} draft={{ ...draft, calculationMode: undefined }} state={{ status: "idle" }} locked={false} onChange={onChange} onCalculate={onCalculate} onCancel={onCancel} t={key => key} />);
  expect((screen.getByRole("button", { name: "strategy.workspace.calculate" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("strategy.calculation.condition"), { target: { value: "dry" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ calculationMode: "dry" }));

  view.rerender(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "calculating" }} locked={false} onChange={onChange} onCalculate={onCalculate} onCancel={onCancel} t={key => key} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("shows the exact calculated plan and accepts only through the acceptance controller", () => {
  const accept = vi.fn();
  const acceptance = { state: { status: "idle" as const }, accept, resolve: vi.fn(), retry: vi.fn(), dismiss: vi.fn() };
  const input = recordedCalculationInput(draft, planning("2026-09-15T00:00:00.000Z"));
  const plan: StrategyOrbitCalculatedPlanV1 = {
    modelVersion: "strategy.solver.v2", objective: "minimum_total_seconds", optimality: "proven",
    totalLaps: 4, total: 370, stops: 1, maxLaps: 3, avgFuel: 2, avgPace: 90,
    drivingSeconds: 360, pitSeconds: 10, startFuelLiters: 8, finishFuelLiters: 1.6,
    reserveLaps: .8, reserveRequiredLaps: .8, reserveSatisfied: true, savingApplied: false,
    distribution: [{ driverId: "alex", laps: 4, seconds: 360 }],
    stints: [
      { i: 0, d: "alex", laps: 2, fuel: 5, pace: 90, start: 0, end: 180, lap0: 1, lap1: 2, pitWindowLap: 2, pitWindowSeconds: 180, over: false, manual: false, savingLevel: "none", fuelSavedPerLap: 0, savingCostSeconds: 0 },
      { i: 1, d: "alex", laps: 2, fuel: 5, pace: 90, start: 190, end: 370, lap0: 3, lap1: 4, pitWindowLap: 4, pitWindowSeconds: 370, over: false, manual: false, savingLevel: "none", fuelSavedPerLap: 0, savingCostSeconds: 0 },
    ],
    stopDetails: [{ index: 0, lap: 2, fuelInLiters: 1, fuelOutLiters: 5, pitLossSeconds: 10, pitTransitSeconds: 6, pitServiceSeconds: 4, pitOverlapSeconds: 0, pitBreakdownAvailable: true }],
  };
  render(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "success", input, result: { plans: { "recorded-main": plan }, comparisons: {} } }} locked={false} onChange={vi.fn()} onCalculate={vi.fn()} onCancel={vi.fn()} t={key => key} />);

  expect(screen.getByText("strategy.calculation.optimal")).toBeTruthy();
  expect(screen.getByText("strategy.plan.stop 1")).toBeTruthy();
  expect(screen.getByText(revision.sessionId)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.plan.accept" }));
  expect(accept).toHaveBeenCalledOnce();
});
