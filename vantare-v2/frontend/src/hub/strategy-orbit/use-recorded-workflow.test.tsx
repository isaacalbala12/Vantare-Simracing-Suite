import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseAnalysisOpenedSession, parseCorrectionStoreResult } from "../../strategy/analysis-contract";
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
  const analysis = { close, load: vi.fn(), pending: vi.fn().mockResolvedValue(undefined), acknowledge: vi.fn().mockResolvedValue(undefined), page: vi.fn(), save: vi.fn(), project: vi.fn() };
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const hook = renderHook(() => useRecordedWorkflow({ eventId: "event", repositoryVersion: options ? options.repositoryVersion : 7, catalog: [], application, analysis: analysis as unknown as AnalysisClient, onCleanupError: vi.fn() }));
  return { ...hook, execute, close, analysis };
}
it("switches A → manual → B → A without stale revisions or retained handles", async () => {
  const f = setup();
  const second = { ...session, candidateId: "second", combinationId: "combo-b", combination: { ...session.combination!, id: "combo-b", trackName: "Spa" }, opened: { sessionId: "handle-b" }, revision: { ...session.revision, sessionId: "source-b" } } as RecordedSession;
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => id === "second" ? second : session);
  const b = { ...candidate, id: "second" };
  await act(() => f.result.current.sessions.openAndApply(candidate));
  expect(f.result.current.draft.sessions).toEqual([session.revision]);
  act(() => f.result.current.change({ ...f.result.current.draft, name: "My race" }));
  await act(() => f.result.current.startManual());
  expect(f.close).toHaveBeenCalledWith("handle");
  expect(f.result.current.draft).toMatchObject({ name: "My race", mode: "manual", sessions: [], combination: undefined });
  await act(() => f.result.current.sessions.openAndApply(b));
  expect(f.result.current.draft).toMatchObject({ mode: "automatic", combination: { combinationId: "combo-b" }, sessions: [second.revision] });
  await act(() => f.result.current.sessions.openAndApply(candidate));
  expect(f.close).toHaveBeenCalledWith("handle-b");
  expect(f.result.current.draft).toMatchObject({ name: "My race", combination: { combinationId: "combo" }, sessions: [session.revision] });
  expect(f.result.current.sessions.sessions).toHaveLength(1);
});
it("keeps confirmed energy rules only when the replacement has the same car and track", async () => {
  const f = setup();
  const gt3 = { ...session, combination: { ...session.combination!, carClass: "LMGT3" } };
  const other = { ...session, candidateId: "other", combinationId: "other-combo", combination: { ...session.combination!, id: "other-combo", trackName: "Spa" }, opened: { sessionId: "other-handle" }, revision: { ...session.revision, sessionId: "other-source" } };
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => id === "other" ? other : gt3);
  await act(() => f.result.current.sessions.openAndApply(candidate));
  act(() => f.result.current.change({ ...f.result.current.draft, virtualEnergy: { applicability: "applicable", capacityPercent: 100, initialPercent: 96, reservePercent: 4 } }));
  await act(() => f.result.current.sessions.openAndApply(candidate));
  expect(f.result.current.draft.virtualEnergy).toEqual({ applicability: "applicable", capacityPercent: 100, initialPercent: 96, reservePercent: 4 });
  expect(f.result.current.draft.sessions).toEqual([session.revision]);
  await act(() => f.result.current.sessions.openAndApply({ ...candidate, id: "other" }));
  expect(f.result.current.draft.virtualEnergy).toEqual({ applicability: "not_applicable" });
  expect(f.result.current.draft.sessions).toEqual([other.revision]);
});
it("changes a manual draft to telemetry when a library source is applied", async () => {
  const f = setup();
  await act(() => f.result.current.startManual());
  act(() => f.result.current.change({ ...f.result.current.draft, manualInputs: { paceSeconds: 91, fuelLitersPerLap: 2.4 } }));
  await act(() => f.result.current.sessions.open(candidate));
  await act(() => f.result.current.sessions.apply());
  expect(f.result.current.draft).toMatchObject({ mode: "automatic", sessions: [session.revision], manualInputs: undefined });
});
it("retains pending source edits and adopts only the selected revision without saving the plan", async () => {
  const f = setup();
  const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: "b".repeat(64) };
  const channel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const complete = { ...session, base, editableChannelIds: ["fuel"], opened: { sessionId: "handle", session: { schema_version: 1 as const, id: "source", metadata: [], channels: [channel] } } };
  vi.mocked(openRecordedSession).mockResolvedValue(complete);
  const loaded = { headId: complete.revision.revisionId, revision: { revisionId: complete.revision.revisionId, snapshot: { base, snapshotId: complete.revision.snapshotId, corrections: [] } } };
  const page = { channel_id: "fuel", start: 0, sampling: channel.sampling, samples: [{ index: 4, values: [{ column: "value", present: true, quality: "unknown", scalar: { kind: "number", number: 12 } }] }] };
  f.analysis.load.mockResolvedValue(loaded);
  f.analysis.page.mockResolvedValue(page);
  const next = { ...complete.revision, revisionId: "d".repeat(64), snapshotId: "e".repeat(64) };
  f.analysis.save.mockImplementation(async request => ({ headId: next.revisionId, revision: { revisionId: next.revisionId, snapshot: { base, snapshotId: next.snapshotId, corrections: request.corrections.map((item: unknown) => ({ request: item })) } } }));
  f.analysis.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [next] });
  await act(() => f.result.current.sessions.open(candidate));
  await act(() => f.result.current.sessions.apply());
  await act(() => f.result.current.openEditor());
  expect(f.result.current.dirty).toBe(false);
  await act(() => f.result.current.sessions.corrections.load(complete));
  await act(() => f.result.current.sessions.corrections.page("fuel", 0));
  act(() => f.result.current.sessions.corrections.edit(4, "value", { kind: "number", number: 0 }, "Checked"));
  expect(f.result.current.dirty).toBe(true);
  await act(() => f.result.current.sessions.close(complete));
  expect(f.close).not.toHaveBeenCalled();
  await act(() => f.result.current.save());
  expect(f.execute).toHaveBeenCalledTimes(1);
  act(() => f.result.current.prepare());
  expect(f.result.current.view).toBe("editor");
  await act(() => f.result.current.sessions.corrections.save("Checked observation"));
  expect(f.result.current.draft.sessions).toEqual([complete.revision]);
  await act(() => f.result.current.sessions.corrections.adopt());
  expect(f.result.current.draft.sessions).toEqual([next]);
  expect(f.result.current.sessions.sessions[0].revision).toEqual(next);
  expect(f.result.current.dirty).toBe(true);
  expect(f.execute).toHaveBeenCalledTimes(1);
});
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
// Contract fixtures below are hand-built shapes, not real recorded data.
function recordedInspectionWorld(options: { candidateId: string; handle: string; source: string }) {
  const base = { sessionId: options.source, contentSha256: "a".repeat(64), sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: "b".repeat(64) };
  const initial = "f".repeat(64);
  const channel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" }, sampling: { kind: "event_timestamped", origin: "source_timestamp" }, columns: [{ name: "value", type: "number" }] };
  const opened = parseAnalysisOpenedSession({ sessionId: options.handle, session: { schema_version: 1, id: options.source, metadata: [{ key: "TrackName", sensitive: false, present: true, quality: "valid", value: "Imola" }], channels: [channel] } });
  const stored = parseCorrectionStoreResult({ headId: initial, revision: { revisionId: initial, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: initial, corrections: [] } } });
  const session: RecordedSession = { candidateId: options.candidateId, opened, base, revision: { sessionId: options.source, baseDigest: "e".repeat(64), revisionId: initial, snapshotId: initial }, projectionUnavailableReason: "metadata_unavailable" };
  const candidate = { id: options.candidateId, state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  return { base, opened, stored, session, candidate };
}
const inspectionWorld = recordedInspectionWorld({ candidateId: "inspected", handle: "inspection-handle", source: "inspection-source" });
const inspection = inspectionWorld.session;
const inspectedCandidate = inspectionWorld.candidate;
const inspectionStored = inspectionWorld.stored;
it("inspects an owned source without drafting, saving or calculating", async () => {
  const f = setup({});
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  f.analysis.load.mockResolvedValue(inspectionStored);
  await act(() => f.result.current.sessions.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = f.result.current.inspect(inspection); });
  expect(accepted).toBe(true);
  expect(f.result.current.view).toBe("editor");
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.result.current.draft.sessions).toEqual([]);
  await act(async () => {});
  expect(f.result.current.sessions.corrections.editor?.session).toBe(inspection);
});
it("releases inspected source data when switching from inspection to manual preparation", async () => {
  const f = setup();
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  f.analysis.load.mockResolvedValue(inspectionStored);
  await act(() => f.result.current.sessions.open(inspectedCandidate));
  act(() => { expect(f.result.current.inspect(inspection)).toBe(true); });
  await act(async () => {});
  expect(f.result.current.sessions.corrections.editor?.session).toBe(inspection);
  await act(() => f.result.current.startManual());
  expect(f.result.current.view).toBe("preparation");
  expect(f.result.current.sessions.corrections.editor).toBeNull();
  expect(f.close).toHaveBeenCalledWith("inspection-handle");
});
it("does not inspect during a pending race write", async () => {
  const f = setup();
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => (id === inspectedCandidate.id ? inspection : session));
  await act(() => f.result.current.sessions.open(candidate));
  await act(() => f.result.current.sessions.apply());
  await act(() => f.result.current.sessions.open(inspectedCandidate));
  let reject!: (error: Error) => void;
  f.execute.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  let accepted!: boolean;
  act(() => {
    pending = f.result.current.openEditor();
    accepted = f.result.current.inspect(inspection);
  });
  expect(accepted).toBe(false);
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.result.current.view).toBe("preparation");
  expect(f.analysis.load).not.toHaveBeenCalled();
  await act(async () => { reject(new Error("storage failed")); await pending; });
});
it("rejects inspection of a foreign source without leaving preparation", async () => {
  const f = setup();
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  await act(() => f.result.current.sessions.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = f.result.current.inspect({ ...inspection, opened: { ...inspection.opened, sessionId: "foreign-handle" } }); });
  expect(accepted).toBe(false);
  expect(f.result.current.view).toBe("preparation");
  expect(f.analysis.load).not.toHaveBeenCalled();
});
it("never adopts a non-projectable selection", async () => {
  const f = setup();
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  await act(() => f.result.current.sessions.open(inspectedCandidate));
  await act(() => f.result.current.sessions.apply());
  expect(f.result.current.draft.sessions).toEqual([]);
  expect(f.result.current.sessions.error).toBe("recorded_combination_unavailable");
  expect(f.execute).not.toHaveBeenCalled();
});
