import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { useRecordedCalculation } from "./use-recorded-calculation";
import { createRecordedWizardDraft, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedPlan } from "./StrategyRecordedPlan";

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
      : result(command, { orbitCalculation: { plans: {}, comparisons: {} } }));
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => true), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));

    await act(() => hook.current.calculate());

    expect(hook.current.state.status).toBe("success");
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

  it("does not dispatch calculate when the selected telemetry family is missing", async () => {
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => result(command, { planningInputStatus: "available", planningInputs: planning((command as Extract<typeof command, { operation: "get_revision_planning_inputs" }>).generatedAt, false) }));
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => false), dispose: vi.fn() };
    const { result: hook } = renderHook(() => useRecordedCalculation(draft, 7, application));
    await act(() => hook.current.calculate());
    expect(hook.current.state.status).toBe("error");
    expect(execute).toHaveBeenCalledOnce();
  });
});

it("requires an explicit supported condition and exposes cancel while running", () => {
  const onChange = vi.fn(), onCalculate = vi.fn(), onCancel = vi.fn();
  const view = render(<StrategyRecordedPlan draft={{ ...draft, calculationMode: undefined }} state={{ status: "idle" }} locked={false} onChange={onChange} onCalculate={onCalculate} onCancel={onCancel} t={key => key} />);
  expect((screen.getByRole("button", { name: "strategy.workspace.calculate" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("strategy.calculation.condition"), { target: { value: "dry" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ calculationMode: "dry" }));

  view.rerender(<StrategyRecordedPlan draft={draft} state={{ status: "calculating" }} locked={false} onChange={onChange} onCalculate={onCalculate} onCancel={onCancel} t={key => key} />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});
