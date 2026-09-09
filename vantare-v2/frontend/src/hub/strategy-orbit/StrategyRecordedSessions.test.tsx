import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { StrategyRecordedSessions } from "./StrategyRecordedSessions";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function fixture() {
  const candidate = { id: "candidate", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  const client = { discover: vi.fn().mockResolvedValue([candidate]), close: vi.fn().mockResolvedValue(undefined) };
  const session = { candidateId: "candidate", combinationId: "combo", base: { sessionId: "source" }, opened: { sessionId: "handle", session: { metadata: [] } }, revision: { sessionId: "source", revisionId: "a".repeat(64), baseDigest: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const onApply = vi.fn().mockResolvedValue(undefined);
  const onCleanupError = vi.fn();
  const view = render(<StrategyRecordedSessions client={client as unknown as AnalysisClient} combinationId="combo" revisions={[session.revision]} onApply={onApply} onCleanupError={onCleanupError} t={(key) => key} />);
  return { client, session, onApply, onCleanupError, view };
}
async function prepare() {
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.discover" }));
  fireEvent.click(await screen.findByRole("button", { name: "strategy.recorded.open" }));
  await screen.findByRole("button", { name: "strategy.recorded.apply" });
}
describe("recorded sessions panel", () => {
  it("does not open without action and applies only the prepared references", async () => {
    const { client, session, onApply, view } = fixture();
    expect(client.discover).not.toHaveBeenCalled();
    expect(openRecordedSession).not.toHaveBeenCalled();
    await prepare();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.apply" }));
    await screen.findByText("strategy.recorded.applied");
    expect(onApply).toHaveBeenCalledWith([session], expect.any(AbortSignal));
    expect(client.close).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(client.close).toHaveBeenCalledWith("handle"));
  });
  it("retains an open session when applying fails and permits retry", async () => {
    const { onApply, client } = fixture();
    onApply.mockRejectedValueOnce(new Error("source unavailable"));
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.apply" }));
    expect((await screen.findByRole("alert")).textContent).toContain("source unavailable");
    expect(client.close).not.toHaveBeenCalled();
    expect(screen.queryByText("strategy.recorded.applied")).toBeNull();
  });
  it("keeps a failed close visible and retains ownership for retry", async () => {
    const { client } = fixture();
    await prepare();
    client.close.mockRejectedValueOnce(new Error("close failed"));
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.close" }));
    expect((await screen.findByRole("alert")).textContent).toContain("close failed");
    expect(screen.getByRole("button", { name: "strategy.recorded.apply" })).toBeTruthy();
  });
  it("reports cleanup failure after leaving", async () => {
    const { client, view, onCleanupError } = fixture();
    await prepare();
    client.close.mockRejectedValue(new Error("close failed"));
    view.unmount();
    await waitFor(() => expect(onCleanupError).toHaveBeenCalledOnce());
  });
});
