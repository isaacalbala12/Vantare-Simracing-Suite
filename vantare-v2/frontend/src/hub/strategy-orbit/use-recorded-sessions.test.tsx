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
