import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { useRecordedWorkflow } from "./use-recorded-workflow";

vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const candidate = { id: "candidate", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
const session = { candidateId: "candidate", combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, opened: { sessionId: "handle" }, revision: { sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
function setup(options?: { repositoryVersion?: number }) {
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => ({
    protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false,
    ...("draft" in command ? { draft: structuredClone(command.draft) } : {}),
  }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  const analysis = { close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const hook = renderHook(() => useRecordedWorkflow({ eventId: "event", repositoryVersion: options ? options.repositoryVersion : 7, catalog: [], application, analysis, onCleanupError: vi.fn() }));
  return { ...hook, execute, close };
}
it("keeps the first handle through explicit acceptance, native save and preparation/editor navigation", async () => {
  const { result, execute, close, unmount } = setup();
  await act(() => result.current.sessions.open(candidate));
  expect(result.current.draft.combination).toBeUndefined();
  expect(result.current.choices[0].combinationId).toBe("combo");
  expect(execute).not.toHaveBeenCalled();
  await act(() => result.current.sessions.apply());
  expect(result.current.draft.sessions).toEqual([session.revision]);
  await act(() => result.current.openEditor());
  expect(result.current.view).toBe("editor");
  expect(result.current.dirty).toBe(false);
  expect(execute.mock.calls[0][0]).toMatchObject({ operation: "create", expectedRepositoryVersion: 7, draft: { payload: { draft: { sessions: [session.revision] } } } });
  act(() => result.current.prepare());
  expect(result.current.view).toBe("preparation");
  expect(close).not.toHaveBeenCalled();
  unmount();
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith("handle"));
});
it("stays in preparation with unsaved edits when native persistence fails", async () => {
  const { result, execute } = setup();
  await act(() => result.current.sessions.open(candidate));
  await act(() => result.current.sessions.apply());
  execute.mockRejectedValueOnce(new Error("revision conflict"));
  await act(() => result.current.openEditor());
  expect(result.current.view).toBe("preparation");
  expect(result.current.stored).toBeUndefined();
  expect(result.current.dirty).toBe(true);
  expect(result.current.error).toBe("revision conflict");
  expect(execute).toHaveBeenCalledOnce();
});
it("prevents double saves and edits while a native write is pending", async () => {
  const { result, execute } = setup();
  await act(() => result.current.sessions.open(candidate));
  await act(() => result.current.sessions.apply());
  let reject!: (error: Error) => void;
  execute.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.openEditor(); });
  act(() => result.current.change({ ...result.current.draft, name: "Overwritten" }));
  await act(() => result.current.openEditor());
  expect(execute).toHaveBeenCalledOnce();
  expect(result.current.draft.name).toBe("");
  expect(result.current.saving).toBe(true);
  await act(async () => { reject(new Error("storage failed")); await pending; });
  expect(result.current.saving).toBe(false);
});
it("does not substitute version zero when the repository has not been loaded", async () => {
  const { result, execute } = setup({});
  await act(() => result.current.sessions.open(candidate));
  await act(() => result.current.sessions.apply());
  await act(() => result.current.openEditor());
  expect(execute).not.toHaveBeenCalled();
  expect(result.current.view).toBe("preparation");
  expect(result.current.error).toBe("recorded_repository_unavailable");
});
