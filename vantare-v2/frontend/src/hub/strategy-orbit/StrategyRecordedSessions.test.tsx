import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialogs } from "@wailsio/runtime";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseAnalysisBase, parseAnalysisCandidates, parseAnalysisOpenedSession } from "../../strategy/analysis-contract";
import { StrategyRecordedSessions, StrategyRecordedSessionsView } from "./StrategyRecordedSessions";
import type { RecordedSessionsController } from "./use-recorded-sessions";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
vi.mock("@wailsio/runtime", () => ({ Dialogs: { OpenFile: vi.fn() }, Call: { ByName: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function fixture() {
  const candidate = { id: "candidate", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  const client = { discover: vi.fn().mockResolvedValue([candidate]), close: vi.fn().mockResolvedValue(undefined), saveVerifiedCopy: vi.fn().mockResolvedValue({ path: "C:\\kept\\copy.duckdb", contentSha256: "d".repeat(64), sizeBytes: 1024 }), selectFile: vi.fn().mockResolvedValue({ id: "selected", state: "ready", size: 1024, modifiedAt: "2026-09-24T18:00:00Z", walPresent: false, displayName: "copy.duckdb" }) };
  const session = { candidateId: "candidate", combinationId: "combo", base: { sessionId: "source", contentSha256: "d".repeat(64), sizeBytes: 1024 }, opened: { sessionId: "handle", session: { metadata: [] } }, revision: { sessionId: "source", revisionId: "a".repeat(64), baseDigest: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
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
  it("adds only the chosen file to the session library", async () => {
    const { client } = fixture();
    vi.mocked(Dialogs.OpenFile).mockResolvedValueOnce("C:\\kept\\copy.duckdb");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.selectFile" }));
    await screen.findByText("copy.duckdb");
    expect(client.selectFile).toHaveBeenCalledWith("C:\\kept\\copy.duckdb", expect.any(AbortSignal));
    expect(openRecordedSession).not.toHaveBeenCalled();
  });
  it("explains a mismatched saved source without claiming recovery", () => {
    const controller: RecordedSessionsController = { candidates: [], sessions: [], busy: false, error: "recorded_source_mismatch", applied: false, discover: vi.fn(), open: vi.fn(), close: vi.fn(), apply: vi.fn(), cancel: vi.fn() };
    render(<StrategyRecordedSessionsView controller={controller} t={key => key} />);
    expect(screen.getByRole("alert").textContent).toBe("strategy.recorded.sourceMismatch");
  });
  it("saves a verified copy only after the user chooses a folder", async () => {
    const { client } = fixture();
    await prepare();
    vi.mocked(Dialogs.OpenFile).mockResolvedValueOnce("");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.copySave" }));
    await waitFor(() => expect(Dialogs.OpenFile).toHaveBeenCalled());
    expect(client.saveVerifiedCopy).not.toHaveBeenCalled();
    vi.mocked(Dialogs.OpenFile).mockResolvedValueOnce("C:\\kept");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.copySave" }));
    await screen.findByText(/strategy.recorded.copySaved/);
    expect(client.saveVerifiedCopy).toHaveBeenCalledWith("handle", "C:\\kept", expect.any(AbortSignal));
  });
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
describe("recorded session inspection entries", () => {
  const ia = "a".repeat(64), ib = "b".repeat(64), ic = "c".repeat(64);
  const ibase = parseAnalysisBase({ sessionId: "source", contentSha256: ia, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: ib });
  const iopened = (sessionId: string, metadata: { key: string; present: boolean; quality: "valid"; sensitive: false; value: string }[] = []) =>
    parseAnalysisOpenedSession({ sessionId, session: { schema_version: 1, id: "source", channels: [], metadata } });
  const icandidates = parseAnalysisCandidates([{ id: "partial", displayName: "Imola_partial.duckdb", state: "ready", size: 1024, modifiedAt: "2026-09-10T00:00:00Z", walPresent: false }]);
  function inspectionController() {
    const partial: RecordedSession = { candidateId: "partial", base: ibase, opened: iopened("handle"), revision: { sessionId: "source", revisionId: ia, baseDigest: ib, snapshotId: ic }, projectionUnavailableReason: "metadata_unavailable" };
    const controller: RecordedSessionsController = { candidates: icandidates, sessions: [partial], busy: false, error: "", applied: false, discover: vi.fn(), open: vi.fn(), close: vi.fn(), apply: vi.fn(), cancel: vi.fn() };
    return { partial, controller };
  }
  it("offers inspection only when the parent provides a callback", () => {
    const { controller, partial } = inspectionController();
    const onInspect = vi.fn();
    const view = render(<StrategyRecordedSessionsView controller={controller} onInspect={onInspect} t={key => key} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.inspect" }));
    expect(onInspect).toHaveBeenCalledExactlyOnceWith(partial);
    view.unmount();
    cleanup();
    render(<StrategyRecordedSessionsView controller={controller} t={key => key} />);
    expect(screen.queryByRole("button", { name: "strategy.recorded.inspect" })).toBeNull();
  });
  it("names a partial source from its candidate and blocks race use", () => {
    const { controller } = inspectionController();
    render(<StrategyRecordedSessionsView controller={controller} onInspect={vi.fn()} t={key => key} />);
    expect(screen.getAllByText("Imola_partial.duckdb")).toHaveLength(2);
    expect(screen.getByText("strategy.recorded.inspectionOnly")).toBeTruthy();
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.recorded.apply" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("falls back to unnamed without a candidate and keeps projectable sources usable", () => {
    const { controller, partial } = inspectionController();
    const marked: RecordedSession = { ...partial, candidateId: "missing", combinationId: "combo" };
    const ready: RecordedSession = { candidateId: "ready", combinationId: "combo", base: ibase, opened: iopened("other-handle"), revision: { sessionId: "source", revisionId: "d".repeat(64), baseDigest: ib, snapshotId: ic } };
    const view = render(<StrategyRecordedSessionsView controller={{ ...controller, sessions: [marked, ready] }} onInspect={vi.fn()} t={key => key} />);
    expect(screen.getByText("strategy.recorded.unnamed")).toBeTruthy();
    expect(screen.getAllByText("strategy.recorded.inspectionOnly")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "strategy.recorded.apply" }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    cleanup();
    render(<StrategyRecordedSessionsView controller={{ ...controller, sessions: [ready] }} onInspect={vi.fn()} t={key => key} />);
    expect(screen.queryByText("strategy.recorded.inspectionOnly")).toBeNull();
    expect(screen.queryByText("strategy.recorded.metadataUnavailable")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.recorded.apply" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("disables inspection while locked and translates inspection errors", () => {
    const { controller } = inspectionController();
    const onInspect = vi.fn();
    const view = render(<StrategyRecordedSessionsView controller={{ ...controller, locked: true }} onInspect={onInspect} t={key => key} />);
    expect((screen.getByRole("button", { name: "strategy.recorded.inspect" }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    cleanup();
    render(<StrategyRecordedSessionsView controller={{ ...controller, error: "recorded_combination_unavailable" }} t={key => key} />);
    expect(screen.getByRole("alert").textContent).toBe("strategy.recorded.metadataUnavailable");
    expect(screen.queryByText("recorded_combination_unavailable")).toBeNull();
    cleanup();
    render(<StrategyRecordedSessionsView controller={{ ...controller, error: "recorded_pending_corrections" }} t={key => key} />);
    expect(screen.getByText("strategy.data.finishPending")).toBeTruthy();
    cleanup();
    render(<StrategyRecordedSessionsView controller={{ ...controller, error: "recorded_stale_revision" }} t={key => key} />);
    expect(screen.getByRole("alert").textContent).toBe("strategy.recorded.error");
    expect(screen.queryByText("recorded_stale_revision")).toBeNull();
  });
});
