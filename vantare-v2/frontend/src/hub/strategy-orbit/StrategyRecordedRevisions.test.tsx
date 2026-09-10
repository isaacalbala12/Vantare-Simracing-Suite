import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import type { RecordedCorrectionsController } from "./use-recorded-corrections";
import { StrategyRecordedRevisions } from "./StrategyRecordedRevisions";
afterEach(cleanup);
const t = (key: string) => key;
function fixture() {
  const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
  const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: b };
  const channel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const session: RecordedSession = { candidateId: "candidate", base, combinationId: "combo", opened: { sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [] } }, revision: { sessionId: "source", baseDigest: b, revisionId: a, snapshotId: a } };
  const original = { column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } };
  const corrected = { ...original, scalar: { kind: "number" as const, number: 0 } };
  const current: AnalysisStoreResult = { headId: c, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "command", reason: "Checked fuel observation", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: b, corrections: [{ baseId: a, correctionId: c, original, corrected, request: { base, target: { channelId: "fuel", column: "value", sampleIndex: 4 }, unit: channel.unit, expected: original, replacement: corrected.scalar, reason: "Confirmed zero" } }] } } };
  const methods = { load: vi.fn(), parent: vi.fn(), head: vi.fn(), restore: vi.fn(), project: vi.fn(), adopt: vi.fn(), resolveSave: vi.fn(), retrySave: vi.fn(), cancel: vi.fn() };
  const controller = { ...methods, editor: { session, current, corrections: [], dirty: false }, busy: false, error: "", unresolved: false } as unknown as RecordedCorrectionsController;
  const props = { controller, sessions: [session], sessionLabels: { candidate: "Imola.duckdb" }, busy: false, configurationSaved: true, configurationDirty: false, onSources: vi.fn(), onPendingChange: vi.fn(), t };
  return { session, current, methods, controller, props };
}
describe("source revision history", () => {
  it("does not load on mount and shows original, corrected and reason without adopting", () => {
    const f = fixture();
    render(<StrategyRecordedRevisions {...f.props} />);
    expect(f.methods.load).not.toHaveBeenCalled();
    expect(screen.getByText("12 L")).toBeTruthy();
    expect(screen.getByText("0 L")).toBeTruthy();
    expect(screen.getByText("Confirmed zero")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "strategy.history.parent" }));
    expect(f.methods.parent).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "strategy.history.reviewPinned" }));
    expect(f.methods.load).toHaveBeenCalledExactlyOnceWith(f.session);
    expect(f.methods.adopt).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(f.current.revision.revisionId);
  });
  it("requires a restore reason and keeps it until the revision changes or it is discarded", () => {
    const f = fixture();
    const view = render(<StrategyRecordedRevisions {...f.props} />);
    expect((screen.getByRole("button", { name: "strategy.history.restore" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.history.restoreReason"), { target: { value: "Reviewed earlier values" } });
    expect(f.props.onPendingChange).toHaveBeenLastCalledWith(true);
    expect((screen.getByRole("button", { name: "strategy.history.parent" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.history.restore" }));
    expect(f.methods.restore).toHaveBeenCalledExactlyOnceWith("Reviewed earlier values");
    expect(f.methods.adopt).not.toHaveBeenCalled();
    view.rerender(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, error: "recorded_revision_conflict" }} />);
    expect((screen.getByLabelText("strategy.history.restoreReason") as HTMLTextAreaElement).value).toBe("Reviewed earlier values");
    expect(screen.getByRole("alert").textContent).toBe("strategy.data.conflict");
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.cancel" }));
    expect(f.props.onPendingChange).toHaveBeenLastCalledWith(false);
  });
  it("resolves an uncertain save separately and blocks history navigation", () => {
    const f = fixture();
    const controller = { ...f.controller, unresolved: true, editor: { ...f.controller.editor!, request: { sessionId: "handle", base: f.session.base, corrections: [], command: f.current.revision.command } } };
    render(<StrategyRecordedRevisions {...f.props} controller={controller} />);
    expect((screen.getByRole("button", { name: "strategy.history.parent" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "strategy.history.restore" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.retry" }));
    expect(f.methods.resolveSave).toHaveBeenCalledOnce();
    expect(f.methods.retrySave).toHaveBeenCalledOnce();
    expect(f.methods.restore).not.toHaveBeenCalled();
  });
  it("releases the raw form guard when a dispatched proposal belongs to the controller", () => {
    const f = fixture();
    const view = render(<StrategyRecordedRevisions {...f.props} />);
    fireEvent.change(screen.getByLabelText("strategy.history.restoreReason"), { target: { value: "Restore checked values" } });
    expect(f.props.onPendingChange).toHaveBeenLastCalledWith(true);
    view.rerender(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, unresolved: true, editor: { ...f.controller.editor!, dirty: true } }} />);
    expect(f.props.onPendingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("strategy.history.finishData")).toBeTruthy();
  });
  it("requires explicit projection and then adoption while preserving the saved configuration distinction", () => {
    const f = fixture();
    const view = render(<StrategyRecordedRevisions {...f.props} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).toHaveBeenCalledOnce();
    expect(f.methods.adopt).not.toHaveBeenCalled();
    view.rerender(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { ...f.controller.editor!, projected: { ...f.session, revision: { ...f.session.revision, revisionId: f.current.revision.revisionId } } } }} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.adopt" }));
    expect(f.methods.adopt).toHaveBeenCalledOnce();
    expect(screen.getByText("strategy.history.configurationSaved")).toBeTruthy();
    expect(screen.getByText("strategy.workspace.notCalculated")).toBeTruthy();
  });
});

describe("mixed source history", () => {
  it("shows a family-only revision as a correction with exact lap interval and reason", () => {
    const f = fixture(), family = "combined_stint_pace_curve" as const;
    const original = { family, included: true, exclusionReasons: [] };
    const target = { number: 4, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
    const current: AnalysisStoreResult = { ...f.current, revision: { ...f.current.revision, snapshot: { ...f.current.revision.snapshot, contractVersion: "analysis.observation-snapshot.v2", corrections: [], familyUses: [{ baseId: "a".repeat(64), correctionId: "e".repeat(64), original, corrected: { ...original, included: false, exclusionReasons: ["manual_exclusion"] }, request: { base: f.session.base, target, family, expected: original, included: false, reason: "Pace affected; fuel remains usable" } }] } } };
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { ...f.controller.editor!, current } }} />);
    expect(screen.getByText("strategy.history.activeCorrections 1")).toBeTruthy();
    expect(screen.queryByText("strategy.history.noCorrections")).toBeNull();
    expect(screen.getByText("Pace affected; fuel remains usable")).toBeTruthy();
    expect(screen.getByText("strategy.laps.included")).toBeTruthy();
    expect(screen.getByText("strategy.laps.excluded")).toBeTruthy();
    expect(document.querySelector(`time[datetime="${target.start}"]`)).toBeTruthy();
    expect(document.querySelector(`time[datetime="${target.end}"]`)).toBeTruthy();
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
});
