import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1, StrategyOrbitCalculatedPlanV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { useRecordedCalculation } from "./use-recorded-calculation";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedPlan } from "./StrategyRecordedPlan";
import { assessManualCalculation, recordedCalculationInput } from "./strategy-recorded-calculation";

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
  it("calculates explicit manual references without requesting a telemetry projection", async () => {
    const manual = { ...draft, mode: "manual" as const, sessions: [], manualInputs: { paceSeconds: 90, fuelLitersPerLap: 2 } };
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => result(command, { orbitCalculation: { plans: { "recorded-main": {} as never }, comparisons: {} } }));
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(manual, 7, application));

    await act(() => hook.current.calculate());

    expect(hook.current.state.status).toBe("success");
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({ operation: "calculate_orbit", input: { planningInputs: { overrides: {
      base_pace_seconds: { value: 90, provenance: { kind: "manual" }, confidence: { sampleSize: 0 } },
      fuel_per_lap_liters: { value: 2, provenance: { kind: "manual" }, confidence: { sampleSize: 0 } },
    } } } });
    const input = execute.mock.calls[0][0].input;
    expect(input?.event).toMatchObject({ raceKind: "laps", targetLaps: 4, virtualEnergy: { applicability: "not_applicable" } });
    expect(input?.planningInputs?.overrides).not.toHaveProperty("ve_per_lap_percent");
  });

  it("keeps missing manual values partial and rejects stale telemetry references", () => {
    const manual = { ...draft, mode: "manual" as const, sessions: [], manualInputs: { paceSeconds: 90 } };
    expect(assessManualCalculation(manual)).toMatchObject({ status: "partial", coverage: { blockers: ["fuel"] } });
    expect(() => assessManualCalculation({ ...manual, sessions: [revision] })).toThrow();
  });

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

  it("recalculates stint edits from the exact result without preparing telemetry again", async () => {
    const twoDrivers = { ...draft, drivers: [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }], driverOrder: { mode: "free" as const, ids: ["alex", "sam"] } };
    const basePlan = { totalLaps: 4, total: 360, stops: 1, stints: [{ i: 0, d: "alex", laps: 2 }, { i: 1, d: "sam", laps: 2 }] } as unknown as StrategyOrbitCalculatedPlanV1;
    const editedPlan = { ...basePlan, total: 365, stints: [{ i: 0, d: "sam", laps: 1 }, { i: 1, d: "sam", laps: 3 }] } as unknown as StrategyOrbitCalculatedPlanV1;
    let calculations = 0;
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => {
      if (command.operation === "get_revision_planning_inputs") return result(command, { planningInputStatus: "available", planningInputs: planning(command.generatedAt) });
      calculations += 1;
      return result(command, { orbitCalculation: calculations === 1
        ? { plans: { "recorded-main": basePlan }, comparisons: {} }
        : { plans: { "recorded-main": basePlan, "recorded-stint-edit": editedPlan }, comparisons: { "recorded-main": { totalDeltaSeconds: -5 } as never } } });
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(twoDrivers, 7, application));
    await act(() => hook.current.calculate());

    await act(() => hook.current.recalculateStints([{ index: 0, driverId: "sam", laps: 1 }, { index: 1, driverId: "sam", laps: 3 }]));

    expect(hook.current.state).toMatchObject({ status: "success", input: { activeVariantId: "recorded-stint-edit" } });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.filter(([command]) => command.operation === "get_revision_planning_inputs")).toHaveLength(1);
    expect(execute.mock.calls[2][0]).toMatchObject({ operation: "calculate_orbit", input: {
      activeVariantId: "recorded-stint-edit",
      variants: [
        { id: "recorded-main", driverOrderMode: "free" },
        { id: "recorded-stint-edit", driverOrderMode: "fixed", order: ["sam", "sam"], overrides: { 0: { laps: 1 }, 1: { laps: 3 } } },
      ],
    } });
  });

  it("recalculates pit edits from the current plan without preparing telemetry again", async () => {
    const basePlan = { totalLaps: 4, total: 370, stops: 1, stints: [{ i: 0, d: "alex", laps: 2 }, { i: 1, d: "alex", laps: 2 }], stopDetails: [{ index: 0, lap: 2, fuelInLiters: 1, fuelOutLiters: 5, pitLossSeconds: 10, pitTransitSeconds: 6, pitServiceSeconds: 4, pitOverlapSeconds: 0, pitBreakdownAvailable: true }] } as unknown as StrategyOrbitCalculatedPlanV1;
    let calculations = 0;
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => {
      if (command.operation === "get_revision_planning_inputs") return result(command, { planningInputStatus: "available", planningInputs: planning(command.generatedAt) });
      calculations += 1;
      return result(command, { orbitCalculation: calculations === 1
        ? { plans: { "recorded-main": basePlan }, comparisons: {} }
        : { plans: { "recorded-main": basePlan, "recorded-pit-edit": { ...basePlan, total: 372 } }, comparisons: { "recorded-main": { totalDeltaSeconds: -2 } as never } } });
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));
    await act(() => hook.current.calculate());

    await act(() => hook.current.recalculatePits([{ index: 0, fuelLiters: 6 }]));

    expect(hook.current.state).toMatchObject({ status: "success", input: { activeVariantId: "recorded-pit-edit" } });
    expect(execute.mock.calls.filter(([command]) => command.operation === "get_revision_planning_inputs")).toHaveLength(1);
    expect(execute.mock.calls[2][0]).toMatchObject({ operation: "calculate_orbit", input: {
      activeVariantId: "recorded-pit-edit",
      variants: [
        { id: "recorded-main" },
        { id: "recorded-pit-edit", driverOrderMode: "fixed", order: ["alex", "alex"], overrides: { 0: { laps: 2 }, 1: { laps: 2 } }, pitOverrides: { 0: { fuelLiters: 6 } } },
      ],
    } });
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

  it("does not calculate after a cancelled preparation succeeds late", async () => {
    let resolve!: (value: StrategyApplicationResultV1<RecordedDraftPayload>) => void;
    let pendingCommand!: StrategyApplicationCommandV1<RecordedDraftPayload>;
    const execute = vi.fn((command: StrategyApplicationCommandV1<RecordedDraftPayload>) => {
      pendingCommand = command;
      return new Promise<StrategyApplicationResultV1<RecordedDraftPayload>>(done => { resolve = done; });
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));
    act(() => { void hook.current.calculate(); });
    await waitFor(() => expect(hook.current.state.status).toBe("preparing"));
    act(() => hook.current.cancel());
    expect(hook.current.state.status).toBe("cancelling");
    await act(async () => resolve(result(pendingCommand, { planningInputStatus: "available", planningInputs: planning((pendingCommand as Extract<typeof pendingCommand, { operation: "get_revision_planning_inputs" }>).generatedAt) })));
    expect(hook.current.state.status).toBe("cancelled");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not publish a calculation that succeeds after cancellation", async () => {
    const manual = { ...draft, mode: "manual" as const, sessions: [], manualInputs: { paceSeconds: 90, fuelLitersPerLap: 2 } };
    let resolve!: (value: StrategyApplicationResultV1<RecordedDraftPayload>) => void;
    let pendingCommand!: StrategyApplicationCommandV1<RecordedDraftPayload>;
    const execute = vi.fn((command: StrategyApplicationCommandV1<RecordedDraftPayload>) => {
      pendingCommand = command;
      return new Promise<StrategyApplicationResultV1<RecordedDraftPayload>>(done => { resolve = done; });
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(manual, 7, application));
    act(() => { void hook.current.calculate(); });
    await waitFor(() => expect(hook.current.state.status).toBe("calculating"));
    act(() => hook.current.cancel());
    expect(hook.current.state.status).toBe("cancelling");
    await act(async () => resolve(result(pendingCommand, { orbitCalculation: { plans: { "recorded-main": {} as never }, comparisons: {} } })));
    expect(hook.current.state.status).toBe("cancelled");
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
  const view = render(<StrategyRecordedPlan acceptance={acceptance} draft={{ ...draft, calculationMode: undefined }} state={{ status: "idle" }} locked={false} onChange={onChange} onCalculate={onCalculate} onRecalculateStints={vi.fn()} onRecalculatePits={vi.fn()} onCancel={onCancel} t={key => key} />);
  expect((screen.getByRole("button", { name: "strategy.workspace.calculate" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("strategy.calculation.condition"), { target: { value: "dry" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ calculationMode: "dry" }));

  view.rerender(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "calculating" }} locked={false} onChange={onChange} onCalculate={onCalculate} onRecalculateStints={vi.fn()} onRecalculatePits={vi.fn()} onCancel={onCancel} t={key => key} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("shows the exact calculated plan and accepts only through the acceptance controller", () => {
  const accept = vi.fn();
  const onRecalculate = vi.fn();
  const onRecalculatePits = vi.fn();
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
  const view = render(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "success", input, result: { plans: { "recorded-main": plan }, comparisons: {} } }} sourceLabels={{ [revision.sessionId]: "Imola_R.duckdb" }} locked={false} onChange={vi.fn()} onCalculate={vi.fn()} onRecalculateStints={onRecalculate} onRecalculatePits={onRecalculatePits} onCancel={vi.fn()} t={key => key} />);

  expect(screen.getByText("strategy.calculation.optimal")).toBeTruthy();
  expect(screen.getAllByText("strategy.plan.stop 1")).toHaveLength(1);
  expect(screen.getByText("Imola_R.duckdb")).toBeTruthy();
  expect(screen.queryByText(revision.sessionId)).toBeNull();
  expect(screen.getByText(revision.revisionId.slice(0, 12))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.plan.accept" }));
  expect(accept).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: /strategy\.pitEdit\.title/ }));
  expect(screen.getByRole("list", { name: "strategy.workspace.plan" })).toBeTruthy();
  expect((within(view.container).getByLabelText("strategy.calculation.condition") as HTMLSelectElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("strategy.pitEdit.fuelAdded 1"), { target: { value: "6" } });
  expect(screen.queryByRole("button", { name: "strategy.plan.accept" })).toBeNull();
  expect((screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "strategy.pitEdit.reset" }));
  expect((screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("strategy.pitEdit.fuelAdded 1"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.pitEdit.recalculate" }));
  expect(onRecalculatePits).toHaveBeenCalledWith([{ index: 0, fuelLiters: 6 }]);

  fireEvent.click(screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }));
  fireEvent.click(screen.getByRole("button", { name: /strategy\.stint\.title/ }));
  expect(screen.getByRole("list", { name: "strategy.workspace.plan" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("strategy.stint.dragBoundary 1"), { target: { value: "1" } });
  expect(screen.queryByRole("button", { name: "strategy.plan.accept" })).toBeNull();
  expect((screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "strategy.stint.recalculate" }));
  expect(onRecalculate).toHaveBeenCalledWith([
    { index: 0, driverId: "alex", laps: 1 },
    { index: 1, driverId: "alex", laps: 3 },
  ]);

  const constrainedInput = { ...input, activeVariantId: "recorded-stint-edit", variants: [...input.variants, { ...input.variants[0], id: "recorded-stint-edit" }] };
  view.rerender(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "success", input: constrainedInput, result: { plans: { "recorded-main": plan, "recorded-stint-edit": { ...plan, total: 375 } }, comparisons: { "recorded-main": { totalDeltaSeconds: -5 } as never } } }} locked={false} onChange={vi.fn()} onCalculate={vi.fn()} onRecalculateStints={onRecalculate} onRecalculatePits={onRecalculatePits} onCancel={vi.fn()} t={key => key} />);
  expect(screen.getByText("strategy.recorded.unnamed")).toBeTruthy();
  expect(screen.getByRole("list", { name: "strategy.workspace.plan" })).toBeTruthy();
  expect(screen.getByText("6:15")).toBeTruthy();
  expect(screen.getByText("+5 s")).toBeTruthy();

  const pitInput = { ...constrainedInput, activeVariantId: "recorded-pit-edit", variants: [constrainedInput.variants[1], { ...constrainedInput.variants[1], id: "recorded-pit-edit", pitOverrides: { 0: { fuelLiters: 6 } } }] };
  view.rerender(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "success", input: pitInput, result: { plans: { "recorded-stint-edit": { ...plan, total: 375 }, "recorded-pit-edit": { ...plan, total: 377 } }, comparisons: { "recorded-stint-edit": { totalDeltaSeconds: -2 } as never } } }} locked={false} onChange={vi.fn()} onCalculate={vi.fn()} onRecalculateStints={onRecalculate} onRecalculatePits={onRecalculatePits} onCancel={vi.fn()} t={key => key} />);
  expect(screen.getByText("strategy.pitEdit.cost")).toBeTruthy();
  expect(screen.getByText("+2 s")).toBeTruthy();
  expect((screen.getByLabelText("strategy.stint.dragBoundary 1") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }));
  fireEvent.click(screen.getByRole("button", { name: /strategy\.pitEdit\.title/ }));
  expect((screen.getByLabelText("strategy.pitEdit.fuelAdded 1") as HTMLInputElement).disabled).toBe(false);

  fireEvent.change(screen.getByLabelText("strategy.pitEdit.fuelAdded 1"), { target: { value: "7" } });
  view.rerender(<StrategyRecordedPlan acceptance={acceptance} draft={draft} state={{ status: "error", message: "infeasible", code: "calculation_infeasible" }} locked onChange={vi.fn()} onCalculate={vi.fn()} onRecalculateStints={onRecalculate} onRecalculatePits={onRecalculatePits} onCancel={vi.fn()} t={key => key} />);
  expect((screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /strategy\.data\.tab\.plan/ }));
  expect(screen.getByRole("button", { name: "strategy.calculation.retry" })).toBeTruthy();
});
