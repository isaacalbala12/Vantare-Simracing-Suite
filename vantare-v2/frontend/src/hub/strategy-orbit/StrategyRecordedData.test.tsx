import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordedCorrectionsController } from "./use-recorded-corrections";
import { StrategyRecordedData } from "./StrategyRecordedData";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const t = (key: string) => key;
function fixture() {
  const a = "a".repeat(64), b = "b".repeat(64);
  const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: b };
  const channel = { id: "fuel", source_name: "Fuel level", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const session: RecordedSession = { editableChannelIds: ["fuel"], candidateId: "candidate", base, combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, opened: { sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [] } }, revision: { sessionId: "source", baseDigest: b, revisionId: a, snapshotId: a } };
  const current = parseCorrectionStoreResult({ headId: a, revision: { revisionId: a, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: a, corrections: [] } } });
  const page = { channel_id: "fuel", start: 0, sampling: channel.sampling, samples: [{ index: 4, values: [{ column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } }] }] };
  const methods = { laps: vi.fn(), editFamily: vi.fn().mockReturnValue(true), removeFamily: vi.fn().mockReturnValue(true), load: vi.fn(), page: vi.fn(), edit: vi.fn().mockReturnValue(true), save: vi.fn(), discard: vi.fn(), project: vi.fn(), adopt: vi.fn(), head: vi.fn(), resolveSave: vi.fn(), retrySave: vi.fn(), cancel: vi.fn() };
  const controller = { ...methods, editor: { session, current, page, corrections: [], familyUses: [], classifications: [], dirty: false }, busy: false, error: "", unresolved: false } as unknown as RecordedCorrectionsController;
  return { session, current, page, methods, controller };
}
describe("recorded data screen", () => {
  it("keeps readable samples visible but blocks editing without native capability", () => {
    const f = fixture();
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session: { ...f.session, editableChannelIds: [] } } };
    render(<StrategyRecordedData controller={controller} sessions={[controller.editor.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    expect((screen.getByRole("button", { name: "strategy.data.sample 4" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("strategy.data.readOnlyChannel")).toBeTruthy();
    expect(screen.queryByLabelText("strategy.data.correctedValue")).toBeNull();
  });
  it("requires a reason, preserves the original and submits an explicit zero", () => {
    const f = fixture(), onPendingChange = vi.fn();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={onPendingChange} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    expect(f.methods.page).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.sample 4" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Checked observation" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.edit).toHaveBeenCalledExactlyOnceWith(4, "value", { kind: "number", number: 0 }, "Checked observation");
    expect(screen.getByRole("cell", { name: "12" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "strategy.data.quality.unknown" })).toBeTruthy();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(f.methods.save).not.toHaveBeenCalled();
  });
  it("does not turn a blank numeric field into zero or discard a rejected edit", () => {
    const f = fixture();
    f.methods.edit.mockReturnValue(false);
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.sample 4" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Checked" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.edit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("strategy.data.invalidValue");
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect((screen.getByLabelText("strategy.data.correctedValue") as HTMLInputElement).value).toBe("1");
  });
  it("does not read until a selected source is chosen and keeps missing data distinct", () => {
    const f = fixture();
    render(<StrategyRecordedData controller={{ ...f.controller, editor: null }} sessions={[f.session]} sessionLabels={{ candidate: "Imola_R.duckdb" }} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(f.methods.load).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Imola_R.duckdb" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("strategy.data.source"), { target: { value: "handle" } });
    expect(f.methods.load).toHaveBeenCalledExactlyOnceWith(f.session);
  });
  it("keeps a raw unsaved form across tabs and asks before leaving the workflow", async () => {
    const f = fixture();
    const candidate = { id: "candidate", displayName: "Imola_R.duckdb", state: "ready", size: 10, modifiedAt: "2026-09-10T00:00:00Z", walPresent: false };
    vi.mocked(openRecordedSession).mockResolvedValue(f.session);
    const analysis = { discover: vi.fn().mockResolvedValue([candidate]), load: vi.fn().mockResolvedValue(f.current), page: vi.fn().mockResolvedValue(f.page), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
    const draft = { ...createRecordedWizardDraft(), step: "sessions" as const, combination: { combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, sessions: [f.session.revision] };
    const initial = { repositoryVersion: 1, document: { payload: { contractVersion: "strategy.recorded.draft.v1", eventId: "event", draft } } } as StoredRecordedDraft;
    const application = { execute: vi.fn(), dispose: vi.fn(), cancel: vi.fn() } as StrategyApplicationClient<RecordedDraftPayload>;
    const onExit = vi.fn();
    render(<StrategyRecordedWorkflow eventId="event" initial={initial} catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={onExit} onCleanupError={vi.fn()} navigation={({ requestExit }) => <button onClick={requestExit}>Leave</button>} t={t} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "strategy.data.tab.race" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "strategy.data.tab.data" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.sources" }));
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.discover" }));
    fireEvent.click(await within(drawer).findByRole("button", { name: "strategy.recorded.open" }));
    await within(drawer).findByRole("button", { name: "strategy.recorded.apply" });
    fireEvent.click(within(drawer).getAllByRole("button", { name: "strategy.recorded.close" })[0]);
    fireEvent.change(screen.getByLabelText("strategy.data.source"), { target: { value: "handle" } });
    await screen.findByRole("button", { name: "strategy.laps.load" });
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    fireEvent.change(await screen.findByLabelText("strategy.data.channel"), { target: { value: "fuel" } });
    fireEvent.click(await screen.findByRole("button", { name: "strategy.data.sample 4" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.revisions" }));
    expect((screen.getByLabelText("strategy.history.source") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.data" }));
    expect((screen.getByLabelText("strategy.data.correctedValue") as HTMLInputElement).value).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });
});

function familyScreenFixture() {
  const f = fixture(), family = "combined_stint_pace_curve" as const;
  const target = { number: 3, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
  const use = { family, included: true, exclusionReasons: [] };
  const original = { ...target, complete: true, labels: [], familyUse: [use] };
  const lapPage = { revisionId: f.current.revision.revisionId, headId: f.current.headId, page: { base: f.session.base, snapshotId: f.current.revision.snapshot.snapshotId, start: 0, total: 1, laps: [{ original, effective: original, target, capabilities: [{ family, automaticIncluded: true, effectiveIncluded: true, canInclude: true, canExclude: true }] }] } };
  return { ...f, family, target, controller: { ...f.controller, editor: { ...f.controller.editor!, lapPage, familyUses: [] } } };
}
describe("recorded family screen", () => {
  it("opens on laps and keeps advanced samples behind an explicit action", () => {
    const f = fixture();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.queryByLabelText("strategy.data.channel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.load" }));
    expect(f.methods.laps).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.methods.page).not.toHaveBeenCalled();
  });
  it("stages a family exclusion with a reason and protects the unfinished form", () => {
    const f = familyScreenFixture(), pending = vi.fn();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={pending} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.lap 3" }));
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "exclude" } });
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("strategy.data.source") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.laps.advanced" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pending).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Spin affected pace" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.editFamily).toHaveBeenCalledExactlyOnceWith(f.target, f.family, false, "Spin affected pace");
    expect(f.methods.save).not.toHaveBeenCalled();
    expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("retains a rejected family proposal and removes only the selected decision on automatic", () => {
    const f = familyScreenFixture();
    f.methods.editFamily.mockReturnValue(false);
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.lap 3" }));
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "exclude" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Review" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect((screen.getByLabelText("strategy.data.reason") as HTMLTextAreaElement).value).toBe("Review");
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "automatic" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.removeFamily).toHaveBeenCalledExactlyOnceWith(f.target, f.family);
  });
});

function inspectionFixture() {
  const f = fixture();
  const session: RecordedSession = { ...f.session, combinationId: undefined, combination: undefined, projectionUnavailableReason: "metadata_unavailable" };
  const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
  return { ...f, session, controller };
}
describe("recorded inspection selection (T12g3e regression)", () => {
  it("does not project an inspection-only source into the race and explains why", () => {
    const f = inspectionFixture();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
});
describe("recorded race selection in data (T12g3e)", () => {
  it("prepares only the explicitly selected source and hides the race causes", () => {
    const f = fixture();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} selectedRevisions={[f.session.revision]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.queryByText("strategy.recorded.notSelected")).toBeNull();
    expect(screen.queryByText("strategy.recorded.metadataUnavailable")).toBeNull();
    const prepare = screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement;
    expect(prepare.disabled).toBe(false);
    fireEvent.click(prepare);
    expect(f.methods.project).toHaveBeenCalledOnce();
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
  it("keeps a projectable source out of the race without an explicit selection", () => {
    const f = fixture();
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} selectedRevisions={[]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect(screen.queryByText("strategy.recorded.metadataUnavailable")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
  });
  it.each([
    ["session", { sessionId: "other", baseDigest: "b".repeat(64) }],
    ["base", { sessionId: "source", baseDigest: "c".repeat(64) }],
  ])("treats a %s mismatch as no race selection", (_case, identity) => {
    const f = fixture();
    const foreign = { ...f.session.revision, ...identity };
    render(<StrategyRecordedData controller={f.controller} sessions={[f.session]} selectedRevisions={[foreign]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
  });
  it("blocks a marked source even when it still carries a combination id", () => {
    const f = fixture();
    const session: RecordedSession = { ...f.session, projectionUnavailableReason: "metadata_unavailable" };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
    render(<StrategyRecordedData controller={controller} sessions={[session]} selectedRevisions={[f.session.revision]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect(screen.queryByText("strategy.recorded.notSelected")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
  it("blocks adoption already matching the full selected reference, not just the handle revision", () => {
    const f = fixture();
    const selected = { ...f.session.revision, revisionId: "c".repeat(64), snapshotId: "c".repeat(64) };
    const projected: RecordedSession = { ...f.session, revision: selected };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, projected } };
    render(<StrategyRecordedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.queryByText("strategy.recorded.notSelected")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.data.adopt" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.adopt" }));
    expect(f.methods.adopt).not.toHaveBeenCalled();
  });
  it("adopts a projected revision whose snapshot differs from the selected reference", () => {
    const f = fixture();
    const selected = { ...f.session.revision, revisionId: "c".repeat(64), snapshotId: "c".repeat(64) };
    const projected: RecordedSession = { ...f.session, revision: { ...selected, snapshotId: "b".repeat(64) } };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, projected } };
    render(<StrategyRecordedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    const adopt = screen.getByRole("button", { name: "strategy.data.adopt" }) as HTMLButtonElement;
    expect(adopt.disabled).toBe(false);
    fireEvent.click(adopt);
    expect(f.methods.adopt).toHaveBeenCalledOnce();
  });
  it("keeps adoption available when the projection matches the open handle but not the race selection", () => {
    const f = fixture();
    const selected = { ...f.session.revision, revisionId: "c".repeat(64), snapshotId: "c".repeat(64) };
    const projected: RecordedSession = { ...f.session, revision: { ...f.session.revision } };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, projected } };
    render(<StrategyRecordedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    const adopt = screen.getByRole("button", { name: "strategy.data.adopt" }) as HTMLButtonElement;
    expect(adopt.disabled).toBe(false);
    fireEvent.click(adopt);
    expect(f.methods.adopt).toHaveBeenCalledOnce();
  });
  it("preserves the local save on a marked inspection source", () => {
    const f = inspectionFixture();
    const controller = { ...f.controller, editor: { ...f.controller.editor!, dirty: true } };
    render(<StrategyRecordedData controller={controller} sessions={[f.session]} selectedRevisions={[]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Checked inspection values" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    expect(f.methods.save).toHaveBeenCalledExactlyOnceWith("Checked inspection values");
  });
});
