import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { StrategyRecordedSessions, StrategyRecordedSessionsView } from "./StrategyRecordedSessions";
import type { RecordedSessionsController } from "./use-recorded-sessions";
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
  it("pages and searches hundreds of files without opening or losing prepared sessions", () => {
    const candidates = Array.from({ length: 416 }, (_, index) => ({ id: `candidate-${index}`, displayName: index === 415 ? "São_Paulo.duckdb" : `Imola_${index}.duckdb`, state: index === 0 ? "active" : "ready", size: 1024, modifiedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), walPresent: index === 0 }));
    const session = { candidateId: "already-open", opened: { sessionId: "handle", session: { metadata: [] } }, base: { sessionId: "source" }, revision: { revisionId: "revision" } } as unknown as RecordedSession;
    const controller: RecordedSessionsController = { candidates, sessions: [session], busy: false, error: "", applied: false, discover: vi.fn(), open: vi.fn(), close: vi.fn(), apply: vi.fn(), cancel: vi.fn() };
    const view = render(<StrategyRecordedSessionsView controller={controller} t={key => key} />);
    const list = () => screen.getByRole("list", { name: "strategy.recorded.files" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(25);
    expect(within(list()).getAllByRole("listitem")[0].textContent).toContain("São_Paulo");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.next" }));
    expect(within(list()).getAllByRole("listitem")[0].textContent).toContain("Imola_390.duckdb");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sao" } });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "strategy.recorded.next" })).toBeNull();
    expect(controller.open).not.toHaveBeenCalled();
    expect(controller.close).not.toHaveBeenCalled();
    expect(controller.apply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "strategy.recorded.close" })).toBeTruthy();
    fireEvent.click(within(list()).getByRole("button"));
    expect(controller.open).toHaveBeenCalledWith(candidates[415]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("strategy.recorded.order"), { target: { value: "oldest" } });
    expect(within(list()).getAllByRole("listitem")[0].textContent).toContain("Imola_0.duckdb");
    expect((within(within(list()).getAllByRole("listitem")[0]).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.recorded.availability"), { target: { value: "ready" } });
    expect(within(list()).getAllByRole("listitem")[0].textContent).toContain("Imola_1.duckdb");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.next" }));
    view.rerender(<StrategyRecordedSessionsView controller={{ ...controller, candidates: [candidates[415]] }} t={key => key} />);
    expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
  });
  it("keeps unnamed legacy candidates and reports no search matches without claiming no files", () => {
    const controller: RecordedSessionsController = { candidates: [{ id: "legacy", state: "ready", size: 0, modifiedAt: "2026-09-10T00:00:00Z", walPresent: false }], sessions: [], busy: false, error: "", applied: false, discover: vi.fn(), open: vi.fn(), close: vi.fn(), apply: vi.fn(), cancel: vi.fn() };
    render(<StrategyRecordedSessionsView controller={controller} t={key => key} />);
    expect(screen.getByText("strategy.recorded.unnamed")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Imola" } });
    expect(screen.getByText("strategy.recorded.noMatches")).toBeTruthy();
    expect(screen.queryByText("strategy.recorded.empty")).toBeNull();
  });
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
