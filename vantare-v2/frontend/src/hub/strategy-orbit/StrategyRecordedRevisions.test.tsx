import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAnalysisOpenedSession, parseCorrectionStoreResult, type AnalysisClassificationCorrection, type AnalysisMetadata, type AnalysisStoreResult } from "../../strategy/analysis-contract";
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
  const controller = { ...methods, editor: { session, current, corrections: [], familyUses: [], classifications: [], dirty: false }, busy: false, error: "", unresolved: false } as unknown as RecordedCorrectionsController;
  const props = { controller, sessions: [session], sessionLabels: { candidate: "Imola.duckdb" }, selectedRevisions: [session.revision], busy: false, configurationSaved: true, configurationDirty: false, onSources: vi.fn(), onPendingChange: vi.fn(), t };
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
describe("recorded race selection in history (T12g3e)", () => {
  it("disables the pinned review and the race actions without a selection", () => {
    const f = fixture();
    render(<StrategyRecordedRevisions {...f.props} selectedRevisions={[]} />);
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.history.reviewPinned" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.load).not.toHaveBeenCalled();
    expect(f.methods.project).not.toHaveBeenCalled();
  });
  it("reviews the exact draft ref, distinct from the inspected one, without mutating it", () => {
    const f = fixture();
    const draft = { sessionId: "source", baseDigest: "b".repeat(64), revisionId: "e".repeat(64), snapshotId: "e".repeat(64) };
    const before = { ...f.session.revision };
    render(<StrategyRecordedRevisions {...f.props} selectedRevisions={[draft]} />);
    expect(screen.queryByText("strategy.history.pinned")).toBeNull();
    const review = screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement;
    expect(review.disabled).toBe(false);
    fireEvent.click(review);
    expect(f.methods.load).toHaveBeenCalledExactlyOnceWith({ ...f.session, revision: draft });
    expect(f.session.revision).toEqual(before);
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
  it("marks the viewed revision as pinned only on a full revision and snapshot match", () => {
    const f = fixture();
    const pinned = { sessionId: "source", baseDigest: "b".repeat(64), revisionId: f.current.revision.revisionId, snapshotId: f.current.revision.snapshot.snapshotId };
    const view = render(<StrategyRecordedRevisions {...f.props} selectedRevisions={[pinned]} />);
    expect(screen.getByText("strategy.history.pinned")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<StrategyRecordedRevisions {...f.props} selectedRevisions={[{ ...pinned, snapshotId: "e".repeat(64) }]} />);
    expect(screen.queryByText("strategy.history.pinned")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    ["session", { sessionId: "other", baseDigest: "b".repeat(64), revisionId: "b".repeat(64), snapshotId: "b".repeat(64) }],
    ["base", { sessionId: "source", baseDigest: "c".repeat(64), revisionId: "b".repeat(64), snapshotId: "b".repeat(64) }],
  ])("treats a %s mismatch as no race selection", (_case, foreign) => {
    const f = fixture();
    render(<StrategyRecordedRevisions {...f.props} selectedRevisions={[foreign]} />);
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
  });
  it("blocks a marked source even when it still carries a combination id", () => {
    const f = fixture();
    const session: RecordedSession = { ...f.session, projectionUnavailableReason: "metadata_unavailable" };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
    render(<StrategyRecordedRevisions {...f.props} controller={controller} sessions={[session]} />);
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect(screen.queryByText("strategy.recorded.notSelected")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
  it("explains an inspection source without combination as unavailable for the race", () => {
    const f = fixture();
    const session: RecordedSession = { ...f.session, combinationId: undefined, combination: undefined, projectionUnavailableReason: "metadata_unavailable" };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
    render(<StrategyRecordedRevisions {...f.props} controller={controller} sessions={[session]} selectedRevisions={[]} />);
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const hd = "d".repeat(64), he = "e".repeat(64);
function classMetadata(): AnalysisMetadata[] {
  return [
    { key: "SessionType", present: true, quality: "valid", sensitive: false, value: "practice" },
    { key: "WeatherConditions", present: true, quality: "valid", sensitive: false, value: "Dry" },
  ];
}
function classSession(metadata: AnalysisMetadata[]): RecordedSession {
  const f = fixture();
  const opened = parseAnalysisOpenedSession({ sessionId: "handle", session: { schema_version: 1, id: "source", channels: f.session.opened.session.channels, metadata } });
  return { ...f.session, opened };
}
function classDecision(field: "SessionType" | "WeatherConditions", expectedOriginal: string, replacement: string, reason: string): AnalysisClassificationCorrection {
  const f = fixture();
  return { base: f.session.base, field, expectedOriginal, replacement, reason, provenance: "manual" };
}
function classCurrent(decisions: { request: AnalysisClassificationCorrection; original: string; corrected: string }[], extras: Record<string, unknown> = {}): AnalysisStoreResult {
  const f = fixture();
  const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
  return parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: [], ...extras, classifications: decisions.map((item, index) => ({ baseId: a, correctionId: (index + 1).toString(16).padStart(64, "0"), ...item })) } } });
}
describe("recorded classification history", () => {
  it("counts and renders a class-only snapshot with reason and manual provenance", () => {
    const f = fixture();
    const session = classSession(classMetadata());
    const current = classCurrent([
      { request: classDecision("SessionType", "practice", "race", "Stewards bulletin"), original: "practice", corrected: "race" },
      { request: classDecision("WeatherConditions", "Dry", "Overcast", "Metar check"), original: "Dry", corrected: "Overcast" },
    ]);
    const before = structuredClone([session, current]);
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { session, current, corrections: [], familyUses: [], classifications: [], dirty: false } }} sessions={[session]} />);
    expect(screen.getByText("strategy.history.activeCorrections 2")).toBeTruthy();
    expect(screen.getByText("strategy.classification.field.SessionType")).toBeTruthy();
    expect(screen.getByText("practice")).toBeTruthy();
    expect(screen.getByText("race")).toBeTruthy();
    expect(screen.getByText("Stewards bulletin")).toBeTruthy();
    expect(screen.getByText("Overcast")).toBeTruthy();
    expect(screen.getByText("Metar check")).toBeTruthy();
    expect(screen.getAllByText("strategy.classification.manual")).toHaveLength(2);
    expect(screen.getByText("strategy.classification.weatherHint")).toBeTruthy();
    expect(session).toEqual(before[0]);
    expect(current).toEqual(before[1]);
  });
  it("renders mixed three-group snapshots with a total count", () => {
    const f = fixture(), family = "combined_stint_pace_curve" as const;
    const session = classSession(classMetadata());
    const target = { number: 4, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
    const use = { family, included: true, exclusionReasons: [] };
    const current = classCurrent(
      [{ request: classDecision("SessionType", "practice", "race", "Stewards bulletin"), original: "practice", corrected: "race" }],
      {
        corrections: [{ baseId: "a".repeat(64), correctionId: "f".repeat(64), original: { column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } }, corrected: { column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 0 } }, request: { base: session.base, target: { channelId: "fuel", column: "value", sampleIndex: 4 }, unit: session.opened.session.channels[0].unit, expected: { column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } }, replacement: { kind: "number" as const, number: 0 }, reason: "Confirmed zero" } }],
        familyUses: [{ baseId: "a".repeat(64), correctionId: he, original: use, corrected: { ...use, included: false, exclusionReasons: ["manual_exclusion"] }, request: { base: session.base, target, family, expected: use, included: false, reason: "Pace affected" } }],
      },
    );
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { session, current, corrections: [], familyUses: [], classifications: [], dirty: false } }} sessions={[session]} />);
    expect(screen.getByText("strategy.history.activeCorrections 3")).toBeTruthy();
    expect(screen.getByText("Confirmed zero")).toBeTruthy();
    expect(screen.getByText("Pace affected")).toBeTruthy();
    expect(screen.getByText("Stewards bulletin")).toBeTruthy();
    expect(screen.getByText("race")).toBeTruthy();
  });
  it("shows the exact consulted older revision, neither the newer head nor local pending", () => {
    const f = fixture();
    const session = classSession(classMetadata());
    const saved = classDecision("SessionType", "practice", "race", "Stewards bulletin");
    const old = classCurrent([{ request: saved, original: "practice", corrected: "race" }]);
    const pending = { ...saved, replacement: "qualify", reason: "Amended" };
    const current: AnalysisStoreResult = { ...old, headId: hd };
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { session, current, corrections: [], familyUses: [], classifications: [pending], dirty: true } }} sessions={[session]} />);
    expect(screen.getByText("Stewards bulletin")).toBeTruthy();
    expect(screen.getByText("race")).toBeTruthy();
    expect(screen.queryByText("Amended")).toBeNull();
    expect(screen.queryByText("qualify")).toBeNull();
    expect(screen.queryByText("strategy.history.latest")).toBeNull();
    expect(screen.queryByText("strategy.history.pinned")).toBeNull();
  });
  it.each([
    ["sensitive", { key: "SessionType", present: true, quality: "valid", sensitive: true }],
    ["redacted", { key: "SessionType", present: true, quality: "valid", sensitive: false, redacted: true, value: "" }],
    ["missing", { key: "TrackName", present: true, quality: "valid", sensitive: false, value: "Imola" }],
  ])("hides stored values for a %s original while keeping another field visible", (_case, entry) => {
    const f = fixture();
    const session = classSession([entry as AnalysisMetadata, ...classMetadata().slice(1)]);
    const current = classCurrent([
      { request: classDecision("SessionType", "practice", "race", "Stewards bulletin"), original: "practice", corrected: "race" },
      { request: classDecision("WeatherConditions", "Dry", "Overcast", "Metar check"), original: "Dry", corrected: "Overcast" },
    ]);
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { session, current, corrections: [], familyUses: [], classifications: [], dirty: false } }} sessions={[session]} />);
    expect(screen.getByText("strategy.classification.field.SessionType")).toBeTruthy();
    expect(screen.getByText("strategy.classification.unavailable")).toBeTruthy();
    expect(screen.queryByText("practice")).toBeNull();
    expect(screen.queryByText("race")).toBeNull();
    expect(screen.queryByText("Stewards bulletin")).toBeNull();
    expect(screen.getByText("Dry")).toBeTruthy();
    expect(screen.getByText("Overcast")).toBeTruthy();
    expect(screen.getByText("Metar check")).toBeTruthy();
  });
  it("shows no classification rows on legacy v1 and v2 snapshots", () => {
    const f = fixture();
    const { unmount } = render(<StrategyRecordedRevisions {...f.props} />);
    expect(screen.queryByText("strategy.classification.field.SessionType")).toBeNull();
    expect(screen.queryByText("strategy.classification.field.WeatherConditions")).toBeNull();
    expect(screen.queryByText("strategy.classification.manual")).toBeNull();
    expect(screen.getByText("strategy.history.activeCorrections 1")).toBeTruthy();
    expect(screen.getByText("Confirmed zero")).toBeTruthy();
    unmount();
    const family = "combined_stint_pace_curve" as const;
    const use = { family, included: true, exclusionReasons: [] };
    const target = { number: 4, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
    const v2 = parseCorrectionStoreResult({ headId: "c".repeat(64), revision: { revisionId: "b".repeat(64), parentRevisionId: "a".repeat(64), command: { expectedRevision: "a".repeat(64), commandId: "restore", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "c".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.observation-snapshot.v2", base: f.session.base, snapshotId: "b".repeat(64), corrections: [], familyUses: [{ baseId: "a".repeat(64), correctionId: he, original: use, corrected: { ...use, included: false, exclusionReasons: ["manual_exclusion"] }, request: { base: f.session.base, target, family, expected: use, included: false, reason: "Pace affected" } }] } } });
    render(<StrategyRecordedRevisions {...f.props} controller={{ ...f.controller, editor: { ...f.controller.editor!, current: v2 } }} />);
    expect(screen.queryByText("strategy.classification.field.SessionType")).toBeNull();
    expect(screen.queryByText("strategy.classification.field.WeatherConditions")).toBeNull();
    expect(screen.queryByText("strategy.classification.manual")).toBeNull();
    expect(screen.getByText("strategy.history.activeCorrections 1")).toBeTruthy();
    expect(screen.getByText("Pace affected")).toBeTruthy();
  });
});
