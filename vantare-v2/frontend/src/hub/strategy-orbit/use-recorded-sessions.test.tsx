import { useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
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
  const client = { load, close } as unknown as AnalysisClient;
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
