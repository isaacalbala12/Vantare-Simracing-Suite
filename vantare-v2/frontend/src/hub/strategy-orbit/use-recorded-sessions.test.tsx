import { useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseAnalysisOpenedSession, parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { useRecordedSessions } from "./use-recorded-sessions";
import { StrategyRecordedSessionsView } from "./StrategyRecordedSessions";

vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const candidate = { id: "candidate", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
const session = { candidateId: "candidate", combinationId: "combo", base: { sessionId: "source" }, opened: { sessionId: "handle", session: { metadata: [] } }, revision: { sessionId: "source", revisionId: "a".repeat(64), baseDigest: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;

it("serializes correction reads against close in the same cycle and releases settled editor state", async () => {
  let finish!: (value: unknown) => void;
  const load = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close } as unknown as AnalysisClient;
  const complete = { ...session, base: { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: "b".repeat(64) } };
  vi.mocked(openRecordedSession).mockResolvedValue(complete);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(candidate));
  let reading!: Promise<void>;
  await act(async () => {
    reading = result.current.corrections.load(complete);
    await result.current.close(complete);
  });
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    finish({ headId: complete.revision.revisionId, revision: { revisionId: complete.revision.revisionId, snapshot: { base: complete.base, snapshotId: complete.revision.snapshotId, corrections: [] } } });
    await reading;
  });
  expect(result.current.corrections.editor).not.toBeNull();
  await act(() => result.current.close(complete));
  expect(close).toHaveBeenCalledExactlyOnceWith("handle");
  expect(result.current.corrections.editor).toBeNull();
  expect(result.current.sessions).toEqual([]);
});

it("keeps ownership through view rerenders and closes only when its owner leaves", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { discover: vi.fn().mockResolvedValue([candidate]), close } as unknown as AnalysisClient;
  const onApply = vi.fn().mockResolvedValue(undefined);
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const { result, rerender, unmount } = renderHook(() => useRecordedSessions({ combinationId: "combo", revisions: [], client, onApply, onCleanupError: vi.fn() }));
  await act(() => result.current.open(candidate));
  rerender();
  expect(result.current.sessions).toEqual([session]);
  expect(close).not.toHaveBeenCalled();
  await act(() => result.current.apply());
  expect(onApply).toHaveBeenCalledWith([session], expect.any(AbortSignal));
  expect(result.current.applied).toBe(true);
  unmount();
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith("handle"));
});

it("does not open a writing candidate even when called outside the visible button", async () => {
  const client = { close: vi.fn() } as unknown as AnalysisClient;
  const { result } = renderHook(() => useRecordedSessions({ combinationId: "combo", revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open({ ...candidate, walPresent: true }));
  expect(openRecordedSession).not.toHaveBeenCalled();
});

it("can discover and explicitly prepare a first source before selecting a combination", async () => {
  const client = { discover: vi.fn().mockResolvedValue([candidate]), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  const onApply = vi.fn();
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply, onCleanupError: vi.fn() }));
  await act(() => result.current.discover());
  expect(openRecordedSession).not.toHaveBeenCalled();
  await act(() => result.current.open(candidate));
  expect(openRecordedSession).toHaveBeenCalledWith(client, candidate.id, undefined, [], expect.any(AbortSignal));
  expect(result.current.sessions).toEqual([session]);
  expect(onApply).not.toHaveBeenCalled();
});

it("can unmount and remount the sessions view without closing its underlying handles", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { discover: vi.fn().mockResolvedValue([candidate]), close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  function Workflow() {
    const [visible, setVisible] = useState(true);
    const controller = useRecordedSessions({ combinationId: "combo", revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() });
    return <><button onClick={() => setVisible(value => !value)}>Change screen</button>{visible ? <StrategyRecordedSessionsView controller={controller} t={key => key} /> : <p>Editor</p>}</>;
  }
  const view = render(<Workflow />);
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.discover" }));
  fireEvent.click(await screen.findByRole("button", { name: "strategy.recorded.open" }));
  await screen.findByRole("button", { name: "strategy.recorded.apply" });
  fireEvent.click(screen.getByRole("button", { name: "Change screen" }));
  expect(screen.getByText("Editor")).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Change screen" }));
  expect(screen.getByRole("button", { name: "strategy.recorded.apply" })).toBeTruthy();
  expect(openRecordedSession).toHaveBeenCalledOnce();
  view.unmount();
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith("handle"));
});

// Contract fixtures below are hand-built shapes, not real recorded data.
// Every world carries a complete opened session and a parser-validated
// initial revision; projections below always answer with a valid ID/ref.
const fuelChannel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" }, sampling: { kind: "event_timestamped", origin: "source_timestamp" }, columns: [{ name: "value", type: "number" }] };
function recordedWorld(options: { candidateId: string; handle: string; source: string; combinationId?: string; marked?: boolean }) {
  const base = { sessionId: options.source, contentSha256: "a".repeat(64), sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: "b".repeat(64) };
  const initial = "f".repeat(64);
  const opened = parseAnalysisOpenedSession({ sessionId: options.handle, session: { schema_version: 1, id: options.source, metadata: [{ key: "TrackName", sensitive: false, present: true, quality: "valid", value: "Imola" }], channels: [fuelChannel] } });
  const stored = parseCorrectionStoreResult({ headId: initial, revision: { revisionId: initial, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: initial, corrections: [] } } });
  const session: RecordedSession = { candidateId: options.candidateId, opened, base, revision: { sessionId: options.source, baseDigest: "e".repeat(64), revisionId: initial, snapshotId: initial },
    ...(options.combinationId === undefined ? {} : { combinationId: options.combinationId }),
    ...(options.marked ? { projectionUnavailableReason: "metadata_unavailable" as const } : {}) };
  const candidate = { id: options.candidateId, state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  return { base, initial, opened, stored, session, candidate };
}
const inspectionWorld = recordedWorld({ candidateId: "inspected", handle: "inspection-handle", source: "inspection-source", marked: true });
const inspectionBase = inspectionWorld.base;
const inspectionRevision = inspectionWorld.session.revision;
const inspection = inspectionWorld.session;
const inspectedCandidate = inspectionWorld.candidate;
const inspectionStored = inspectionWorld.stored;
const projectedWorld = recordedWorld({ candidateId: "projected", handle: "projected-handle", source: "projected-source", combinationId: "combo" });
const projectedOtherWorld = recordedWorld({ candidateId: "projected-other", handle: "projected-other-handle", source: "projected-other-source", combinationId: "combo" });
const markedIdWorld = recordedWorld({ candidateId: "marked-id", handle: "marked-id-handle", source: "marked-id-source", combinationId: "combo", marked: true });

it("accepts inspection of an owned source and loads its exact revision", async () => {
  const load = vi.fn().mockResolvedValue(inspectionStored);
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = result.current.inspect(inspection); });
  expect(accepted).toBe(true);
  expect(load).toHaveBeenCalledExactlyOnceWith({ sessionId: "inspection-handle", base: inspectionBase, revisionId: inspectionRevision.revisionId }, expect.any(AbortSignal));
  await act(async () => {});
  expect(result.current.corrections.editor?.session).toBe(inspection);
  expect(close).not.toHaveBeenCalled();
});

it("rejects inspection of a foreign source without touching the client", async () => {
  const load = vi.fn().mockResolvedValue(inspectionStored);
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = result.current.inspect({ ...inspection, opened: { ...inspection.opened, sessionId: "foreign-handle" } }); });
  expect(accepted).toBe(false);
  expect(load).not.toHaveBeenCalled();
});

it("refuses inspection while a session operation is pending", async () => {
  let release!: (value: RecordedSession) => void;
  vi.mocked(openRecordedSession).mockResolvedValueOnce(inspection);
  vi.mocked(openRecordedSession).mockImplementation(() => new Promise<RecordedSession>(resolve => { release = resolve; }));
  const client = { close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  let opening!: Promise<void>;
  let accepted!: boolean;
  act(() => {
    opening = result.current.open(projectedWorld.candidate);
    accepted = result.current.inspect(inspection);
  });
  expect(accepted).toBe(false);
  await act(async () => { release(projectedWorld.session); await opening; });
  expect(result.current.sessions).toEqual([inspection, projectedWorld.session]);
});

it("blocks close, apply and switching inspector while an inspection load is pending", async () => {
  let finish!: (value: unknown) => void;
  const load = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const close = vi.fn().mockResolvedValue(undefined);
  const onApply = vi.fn().mockResolvedValue(undefined);
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => (id === projectedWorld.candidate.id ? projectedWorld.session : projectedOtherWorld.session));
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply, onCleanupError: vi.fn() }));
  await act(() => result.current.open(projectedWorld.candidate));
  await act(() => result.current.open(projectedOtherWorld.candidate));
  // Both sources stay projectable so only the pending load can block Apply.
  let accepted!: boolean;
  let switched!: boolean;
  await act(async () => {
    accepted = result.current.inspect(projectedOtherWorld.session);
    await result.current.close(projectedOtherWorld.session);
    await result.current.apply();
    switched = result.current.inspect(projectedWorld.session);
  });
  expect(accepted).toBe(true);
  expect(switched).toBe(false);
  expect(close).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => { finish(projectedOtherWorld.stored); });
  expect(result.current.corrections.editor?.session).toBe(projectedOtherWorld.session);
});

it("wipes previous editor data when an inspection load fails and keeps its cause", async () => {
  const load = vi.fn(async (request: { sessionId: string }) => {
    if (request.sessionId === inspectionWorld.opened.sessionId) throw new Error("auth denied");
    return projectedWorld.stored;
  });
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => (id === projectedWorld.candidate.id ? projectedWorld.session : inspection));
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(projectedWorld.candidate));
  await act(() => result.current.corrections.load(projectedWorld.session));
  expect(result.current.corrections.editor?.session).toBe(projectedWorld.session);
  await act(() => result.current.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = result.current.inspect(inspection); });
  expect(accepted).toBe(true);
  await act(async () => {});
  expect(result.current.corrections.editor).toBeNull();
  expect(result.current.corrections.error).toBe("auth denied");
  expect(result.current.sessions).toEqual([projectedWorld.session, inspection]);
});

it("rejects adoption of a marked revision carrying an attached identity", async () => {
  const load = vi.fn().mockResolvedValue(markedIdWorld.stored);
  const project = vi.fn().mockResolvedValue({ combinationId: "combo", sourceRevisions: [markedIdWorld.session.revision] });
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), project, close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(markedIdWorld.session);
  const onRevision = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onRevision, onCleanupError: vi.fn() }));
  await act(() => result.current.open(markedIdWorld.candidate));
  await act(() => result.current.corrections.load(markedIdWorld.session));
  await act(() => result.current.corrections.project());
  await act(() => result.current.corrections.adopt());
  expect(onRevision).not.toHaveBeenCalled();
  expect(result.current.corrections.error).toBe("recorded_combination_unavailable");
  expect(result.current.sessions).toEqual([markedIdWorld.session]);
});

it("rejects an unmarked identity enabling a marked owned source", async () => {
  const impostor: RecordedSession = { candidateId: inspection.candidateId, opened: inspection.opened, base: inspectionBase, revision: inspectionRevision, combinationId: "combo" };
  const load = vi.fn().mockResolvedValue(inspectionStored);
  const project = vi.fn().mockResolvedValue({ combinationId: "combo", sourceRevisions: [inspectionRevision] });
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), project, close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  const onRevision = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onRevision, onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  await act(() => result.current.corrections.load(impostor));
  await act(() => result.current.corrections.project());
  await act(() => result.current.corrections.adopt());
  expect(onRevision).not.toHaveBeenCalled();
  expect(result.current.corrections.error).toBe("recorded_combination_unavailable");
  expect(result.current.sessions).toEqual([inspection]);
});

it("loads the owned original when inspected through an altered revision copy", async () => {
  const load = vi.fn().mockResolvedValue(inspectionStored);
  const client = { load, pending: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply: vi.fn(), onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  let accepted!: boolean;
  act(() => { accepted = result.current.inspect({ ...inspection, revision: { ...inspectionRevision, revisionId: "0".repeat(64) } }); });
  expect(accepted).toBe(true);
  expect(load).toHaveBeenCalledExactlyOnceWith({ sessionId: "inspection-handle", base: inspectionBase, revisionId: inspectionRevision.revisionId }, expect.any(AbortSignal));
  await act(async () => {});
  expect(result.current.corrections.editor?.session).toBe(inspection);
});

it("rejects apply of a marked selection atomically", async () => {
  const client = { close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  const onApply = vi.fn().mockResolvedValue(undefined);
  vi.mocked(openRecordedSession).mockResolvedValue(inspection);
  const { result } = renderHook(() => useRecordedSessions({ revisions: [], client, onApply, onCleanupError: vi.fn() }));
  await act(() => result.current.open(inspectedCandidate));
  await act(() => result.current.apply());
  expect(onApply).not.toHaveBeenCalled();
  expect(result.current.applied).toBe(false);
  expect(result.current.error).toBe("recorded_combination_unavailable");
});
