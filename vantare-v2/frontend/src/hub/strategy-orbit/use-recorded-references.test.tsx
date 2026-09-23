import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import type { RecordedSession } from "./strategy-recorded-session";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { useRecordedReferences } from "./use-recorded-references";

const refA = { sessionId: "race-a", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) };
const refB = { sessionId: "race-b", baseDigest: "d".repeat(64), revisionId: "e".repeat(64), snapshotId: "f".repeat(64) };
const combination = { combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" };
const live = (revision = refA, handle = "handle-a") => ({ revision, opened: { sessionId: handle } }) as RecordedSession;
const draft = (sessions = [refA]) => ({ ...createRecordedWizardDraft(), mode: "automatic" as const, combination, sessions });
const planning = (command: { generatedAt: string; sourceRevisions: typeof refA[] }): StrategyPlanningInputsV2 => ({
  overrides: {}, projection: { combinationId: "combo", sourceRevisions: command.sourceRevisions, generatedAt: command.generatedAt },
}) as StrategyPlanningInputsV2;
function client(execute = vi.fn(async (command: { generatedAt: string; sourceRevisions: typeof refA[] }) => ({ planningInputStatus: "available", planningInputs: planning(command) }))) {
  return { execute, cancel: vi.fn(() => true), dispose: vi.fn() } as unknown as StrategyApplicationClient<unknown>;
}

it("loads only the exact selected revision with a live handle, without race rules or drivers", async () => {
  const application = client();
  const selected = draft();
  const { result, rerender } = renderHook(({ currentDraft, opened }) => useRecordedReferences(currentDraft, 9, opened, application), {
    initialProps: { currentDraft: selected, opened: [live()] },
  });
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  expect(application.execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ operation: "get_revision_planning_inputs", combinationId: "combo", sourceRevisions: [refA] }));
  rerender({ currentDraft: { ...selected, name: "typed race title" }, opened: [live()] });
  expect(application.execute).toHaveBeenCalledTimes(1);
  rerender({ currentDraft: { ...selected, sessions: [refB] }, opened: [live(refB, "handle-b")] });
  await waitFor(() => expect(application.execute).toHaveBeenCalledTimes(2));
  expect(application.execute).toHaveBeenLastCalledWith(expect.objectContaining({ sourceRevisions: [refB] }));
});

it("does not query in manual mode or when a saved revision's exact handle is absent", () => {
  const application = client();
  const { result, rerender } = renderHook(({ currentDraft, opened }) => useRecordedReferences(currentDraft, 9, opened, application), {
    initialProps: { currentDraft: { ...draft(), mode: "manual" as const }, opened: [live()] },
  });
  expect(result.current.state.status).toBe("manual");
  rerender({ currentDraft: draft(), opened: [live({ ...refA, baseDigest: "x".repeat(64) })] });
  expect(result.current.state.status).toBe("open_sources");
  expect(application.execute).not.toHaveBeenCalled();
});

it("uses the pinned old revision when the live source handle has a newer head on the same base", async () => {
  const application = client();
  const { result } = renderHook(() => useRecordedReferences(draft(), 9, [live({ ...refA, revisionId: "newer", snapshotId: "newer-snapshot" })], application));
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  expect(application.execute).toHaveBeenCalledWith(expect.objectContaining({ sourceRevisions: [refA] }));
});

it("cancels superseded reads, discards late values and retries a failed exact selection", async () => {
  let resolveFirst!: (value: unknown) => void;
  const execute = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockRejectedValueOnce(new Error("read failed"))
    .mockImplementation(async command => ({ planningInputStatus: "available", planningInputs: planning(command) }));
  const application = client(execute);
  const { result, rerender } = renderHook(({ currentDraft, opened }) => useRecordedReferences(currentDraft, 9, opened, application), {
    initialProps: { currentDraft: draft(), opened: [live()] },
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  rerender({ currentDraft: draft([refB]), opened: [live(refB, "handle-b")] });
  await waitFor(() => expect(result.current.state.status).toBe("error"));
  expect(application.cancel).toHaveBeenCalledWith(execute.mock.calls[0][0].commandId);
  await act(async () => resolveFirst({ planningInputStatus: "available", planningInputs: planning(execute.mock.calls[0][0]) }));
  expect(result.current.state.status).toBe("error");
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  expect(execute.mock.calls[2][0].sourceRevisions).toEqual([refB]);
});

it("clears a pending preview when its handle closes and rejects a substituted response", async () => {
  let resolvePending!: (value: unknown) => void;
  const execute = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { resolvePending = resolve; }))
    .mockImplementation(async command => ({ planningInputStatus: "available", planningInputs: {
      ...planning(command), projection: { ...planning(command).projection, sourceRevisions: [refB] },
    } }));
  const application = client(execute);
  const selected = draft();
  const { result, rerender } = renderHook(({ opened }) => useRecordedReferences(selected, 9, opened, application), {
    initialProps: { opened: [live()] },
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  rerender({ opened: [] });
  expect(result.current.state.status).toBe("open_sources");
  expect(application.cancel).toHaveBeenCalledWith(execute.mock.calls[0][0].commandId);
  await act(async () => resolvePending({ planningInputStatus: "available", planningInputs: planning(execute.mock.calls[0][0]) }));
  expect(result.current.state.status).toBe("open_sources");
  rerender({ opened: [live()] });
  await waitFor(() => expect(result.current.state.status).toBe("error"));
});
