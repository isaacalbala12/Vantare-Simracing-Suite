import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordedCorrectionsController } from "./use-recorded-corrections";
import { useRecordedCorrections } from "./use-recorded-corrections";
import { StrategyRecordedData, type RecordedDataView } from "./StrategyRecordedData";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import { analysisCorrectableFamilies, parseAnalysisLapPage, parseAnalysisOpenedSession, parseAnalysisPage, parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const t = (key: string) => key;
function HostedData(props: Omit<ComponentProps<typeof StrategyRecordedData>, "view" | "onViewChange">) {
  const [view, setView] = useState<RecordedDataView>("laps");
  return <StrategyRecordedData {...props} view={view} onViewChange={setView} />;
}
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
    render(<HostedData controller={controller} sessions={[controller.editor.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    expect((screen.getByRole("button", { name: "strategy.data.sample 4" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("strategy.data.readOnlyChannel")).toBeTruthy();
    expect(screen.queryByLabelText("strategy.data.correctedValue")).toBeNull();
  });
  it("requires a reason, preserves the original and submits an explicit zero", () => {
    const f = fixture(), onPendingChange = vi.fn();
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={onPendingChange} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={{ ...f.controller, editor: null }} sessions={[f.session]} sessionLabels={{ candidate: "Imola_R.duckdb" }} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.queryByLabelText("strategy.data.channel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.load" }));
    expect(f.methods.laps).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.methods.page).not.toHaveBeenCalled();
  });
  it("stages a family exclusion with a reason and protects the unfinished form", () => {
    const f = familyScreenFixture(), pending = vi.fn();
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={pending} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} selectedRevisions={[f.session.revision]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} selectedRevisions={[]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={f.controller} sessions={[f.session]} selectedRevisions={[foreign]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.prepare" }));
    expect(f.methods.project).not.toHaveBeenCalled();
  });
  it("blocks a marked source even when it still carries a combination id", () => {
    const f = fixture();
    const session: RecordedSession = { ...f.session, projectionUnavailableReason: "metadata_unavailable" };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
    render(<HostedData controller={controller} sessions={[session]} selectedRevisions={[f.session.revision]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
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
    render(<HostedData controller={controller} sessions={[f.session]} selectedRevisions={[selected]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    const adopt = screen.getByRole("button", { name: "strategy.data.adopt" }) as HTMLButtonElement;
    expect(adopt.disabled).toBe(false);
    fireEvent.click(adopt);
    expect(f.methods.adopt).toHaveBeenCalledOnce();
  });
  it("preserves the local save on a marked inspection source", () => {
    const f = inspectionFixture();
    const controller = { ...f.controller, editor: { ...f.controller.editor!, dirty: true } };
    render(<HostedData controller={controller} sessions={[f.session]} selectedRevisions={[]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Checked inspection values" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    expect(f.methods.save).toHaveBeenCalledExactlyOnceWith("Checked inspection values");
  });
});

function classificationScreenFixture() {
  const f = fixture();
  const metadata = [
    { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" },
    { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" },
  ];
  const session: RecordedSession = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata } } };
  const methods = { ...f.methods, editClassification: vi.fn().mockReturnValue(true), removeClassification: vi.fn().mockReturnValue(true) };
  const controller = { ...f.controller, ...methods, editor: { ...f.controller.editor!, session } };
  return { ...f, session, methods, controller };
}
function classificationSavedFixture() {
  const f = classificationScreenFixture();
  const request = { base: f.session.base, field: "SessionType" as const, expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" as const };
  const b = "b".repeat(64);
  const current = parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: "a".repeat(64), command: { expectedRevision: "a".repeat(64), commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "c".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: [], familyUses: [], classifications: [{ baseId: "a".repeat(64), correctionId: "d".repeat(64), request, original: "practice", corrected: "race" }] } } });
  return { ...f, request, current };
}
function openClassification() {
  fireEvent.click(screen.getByRole("button", { name: "strategy.classification.tab" }));
}
function bodyCells() {
  return screen.getAllByRole("row").map(row => within(row).queryAllByRole("cell").map(item => item.textContent)).filter(cells => cells.length > 0);
}
describe("recorded classification screen", () => {
  it("opens as a third view and stages a correction with an explicit reason", () => {
    const f = classificationScreenFixture(), pending = vi.fn();
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={pending} t={t} />);
    expect(screen.queryByRole("button", { name: "strategy.classification.field.SessionType" })).toBeNull();
    openClassification();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.SessionType" }));
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "race" } });
    expect((screen.getByLabelText("strategy.data.source") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Stewards bulletin" } });
    expect(pending).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.editClassification).toHaveBeenCalledExactlyOnceWith("SessionType", "race", "Stewards bulletin");
    expect(screen.queryByLabelText("strategy.data.reason")).toBeNull();
    expect(pending).toHaveBeenLastCalledWith(false);
    expect(f.methods.save).not.toHaveBeenCalled();
  });
  it("prepares a withdrawal with its reason and clears the form on acceptance", () => {
    const f = classificationScreenFixture();
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.WeatherConditions" }));
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "original" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Withdraw label" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.removeClassification).toHaveBeenCalledExactlyOnceWith("WeatherConditions");
    expect(screen.queryByLabelText("strategy.data.reason")).toBeNull();
  });
  it("retains a rejected classification form with its reason", () => {
    const f = classificationScreenFixture();
    f.methods.editClassification.mockReturnValue(false);
    render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.SessionType" }));
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Stewards bulletin" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(f.methods.editClassification).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("strategy.data.reason") as HTMLTextAreaElement).value).toBe("Stewards bulletin");
  });
  it("shows a pending withdrawal distinctly from a confirmed decision", () => {
    const f = classificationSavedFixture();
    const withdrawn = { ...f.controller, editor: { ...f.controller.editor!, current: f.current, classifications: [] } };
    const { unmount } = render(<HostedData controller={withdrawn} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    expect(bodyCells()).toEqual([
      ["strategy.classification.field.SessionType", "practice", "race", "practice"],
      ["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"],
    ]);
    unmount();
    const confirmed = { ...f.controller, editor: { ...f.controller.editor!, current: f.current, classifications: [f.request] } };
    render(<HostedData controller={confirmed} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    expect(bodyCells()).toEqual([
      ["strategy.classification.field.SessionType", "practice", "race", "strategy.data.unchanged"],
      ["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"],
    ]);
  });
  it("hides a sensitive original while keeping the other field editable", () => {
    const f = classificationScreenFixture();
    const session: RecordedSession = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: true }, { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" }] } } };
    const controller = { ...f.controller, editor: { ...f.controller.editor!, session } };
    render(<HostedData controller={controller} sessions={[session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    expect(screen.getByText("strategy.classification.unavailable")).toBeTruthy();
    expect(screen.queryByText("practice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.WeatherConditions" }));
    expect((screen.getByLabelText("strategy.data.correctedValue") as HTMLInputElement).value).toBe("Dry");
    expect(screen.getByText("strategy.classification.weatherHint")).toBeTruthy();
  });
  it("disables staging on an uncertain command without losing the open form", () => {
    const f = classificationScreenFixture();
    const { rerender } = render(<HostedData controller={f.controller} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    openClassification();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.SessionType" }));
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Stewards bulletin" } });
    const request = { sessionId: "handle", base: f.session.base, corrections: [], command: { expectedRevision: "a".repeat(64), commandId: "uncertain", reason: "Review", localAuthorId: "local" } };
    rerender(<HostedData controller={{ ...f.controller, editor: { ...f.controller.editor!, request } }} sessions={[f.session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />);
    expect((screen.getByLabelText("strategy.data.correctedValue") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("strategy.data.reason") as HTMLTextAreaElement).value).toBe("Stewards bulletin");
    expect(screen.getByRole("button", { name: "strategy.data.resolve" })).toBeTruthy();
  });
});

function HookedClassificationData({ client, session, onAdopt }: { client: AnalysisClient; session: RecordedSession; onAdopt?: (session: RecordedSession, signal: AbortSignal) => Promise<void> }) {
  const controller = useRecordedCorrections(client, onAdopt ?? (async () => {}));
  return <HostedData controller={controller} sessions={[session]} busy={false} onSources={vi.fn()} onPendingChange={vi.fn()} t={t} />;
}
describe("recorded classification through a real controller", () => {
  it("withdraws a loaded classification only on explicit save and restores the revision", async () => {
    const f = fixture();
    const metadata = [
      { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" },
      { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" },
    ];
    const b = "b".repeat(64), c = "c".repeat(64), d = "d".repeat(64);
    const session: RecordedSession = { ...f.session, combinationId: undefined, combination: undefined, projectionUnavailableReason: "metadata_unavailable", opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata } }, revision: { ...f.session.revision, revisionId: b, snapshotId: b } };
    expect(parseAnalysisOpenedSession(session.opened)).toBe(session.opened);
    const request = { base: session.base, field: "SessionType" as const, expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" as const };
    const current = parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: "a".repeat(64), command: { expectedRevision: "a".repeat(64), commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: session.base, snapshotId: b, corrections: [], familyUses: [], classifications: [{ baseId: "a".repeat(64), correctionId: d, request, original: "practice", corrected: "race" }] } } });
    const save = vi.fn(async (saved: AnalysisSaveRequest) => parseCorrectionStoreResult({ headId: c, revision: { revisionId: c, parentRevisionId: b, command: saved.command, commandDigest: d, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base: session.base, snapshotId: c, corrections: [] } } }));
    const project = vi.fn(), onAdopt = vi.fn(async () => {});
    const client = { load: vi.fn().mockResolvedValue(current), save, project } as unknown as AnalysisClient;
    render(<HookedClassificationData client={client} session={session} onAdopt={onAdopt} />);
    fireEvent.change(screen.getByLabelText("strategy.data.source"), { target: { value: "handle" } });
    await screen.findByRole("button", { name: "strategy.classification.tab" });
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.tab" }));
    expect(bodyCells()).toEqual([
      ["strategy.classification.field.SessionType", "practice", "race", "strategy.data.unchanged"],
      ["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"],
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "strategy.classification.field.SessionType" }));
    expect((screen.getByLabelText("strategy.laps.proposal") as HTMLSelectElement).value).toBe("correct");
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "original" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Withdraw type" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(bodyCells()).toEqual([
      ["strategy.classification.field.SessionType", "practice", "race", "practice"],
      ["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"],
    ]);
    expect((screen.getByLabelText("strategy.data.revisionReason") as HTMLInputElement).value).toBe("Withdraw type");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].classifications).toEqual([]);
    expect(save.mock.calls[0][0].command.reason).toBe("Withdraw type");
    expect(await screen.findByText("strategy.data.savedSeparately")).toBeTruthy();
    expect(bodyCells()).toEqual([
      ["strategy.classification.field.SessionType", "practice", "practice", "strategy.data.unchanged"],
      ["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"],
    ]);
    expect(project).not.toHaveBeenCalled();
    expect(onAdopt).not.toHaveBeenCalled();
  });
  it("saves scalar, family and classification decisions together", async () => {
    const f = fixture();
    const metadata = [
      { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" },
      { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" },
    ];
    const session: RecordedSession = { ...f.session, combinationId: undefined, combination: undefined, projectionUnavailableReason: "metadata_unavailable", opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata } } };
    expect(parseAnalysisOpenedSession(session.opened)).toBe(session.opened);
    const metadataBefore = structuredClone(session.opened.session.metadata);
    const family = "combined_stint_pace_curve" as const;
    const target = { number: 3, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
    const use = { family, included: true, exclusionReasons: [] };
    const original = { ...target, complete: true, labels: [], familyUse: [use] };
    const capabilities = analysisCorrectableFamilies.map(item => ({ family: item, automaticIncluded: true, effectiveIncluded: true, canInclude: true, canExclude: true }));
    const lapPage = { revisionId: f.current.revision.revisionId, headId: f.current.headId, page: { base: session.base, snapshotId: f.current.revision.snapshot.snapshotId, start: 0, total: 1, laps: [{ original, effective: structuredClone(original), target, capabilities }] } };
    expect(parseAnalysisLapPage(lapPage)).toBe(lapPage);
    const page = { channel_id: "fuel", start: 0, sampling: session.opened.session.channels[0].sampling, samples: [{ index: 0, values: [{ column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } }] }] };
    expect(parseAnalysisPage(page)).toBe(page);
    const b = "b".repeat(64), c = "c".repeat(64), d = "d".repeat(64);
    const save = vi.fn(async (request: AnalysisSaveRequest) => parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: "a".repeat(64), command: request.command, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: session.base, snapshotId: b, corrections: request.corrections.map(item => ({ baseId: "a".repeat(64), correctionId: d, request: item, original: item.expected, corrected: { ...item.expected, scalar: item.replacement } })), familyUses: (request.familyUses ?? []).map(item => ({ baseId: "a".repeat(64), correctionId: d, request: item, original: item.expected, corrected: { ...item.expected, included: item.included, exclusionReasons: item.included ? [] : [...(item.expected.exclusionReasons ?? []), "manual_exclusion"] } })), classifications: (request.classifications ?? []).map(item => ({ baseId: "a".repeat(64), correctionId: d, request: item, original: item.expectedOriginal, corrected: "race" })) } } }));
    const client = { load: vi.fn().mockResolvedValue(f.current), page: vi.fn().mockResolvedValue(page), laps: vi.fn().mockResolvedValue(lapPage), save, project: vi.fn() } as unknown as AnalysisClient;
    const onAdopt = vi.fn(async () => {});
    render(<HookedClassificationData client={client} session={session} onAdopt={onAdopt} />);
    fireEvent.change(screen.getByLabelText("strategy.data.source"), { target: { value: "handle" } });
    await screen.findByRole("button", { name: "strategy.classification.tab" });
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.tab" }));
    fireEvent.click(await screen.findByRole("button", { name: "strategy.classification.field.SessionType" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "race" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Stewards bulletin" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    fireEvent.change(await screen.findByLabelText("strategy.data.channel"), { target: { value: "fuel" } });
    fireEvent.click(await screen.findByRole("button", { name: "strategy.data.sample 0" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Checked observation" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.back" }));
    fireEvent.click(await screen.findByRole("button", { name: "strategy.laps.load" }));
    fireEvent.click(await screen.findByRole("button", { name: "strategy.laps.lap 3" }));
    fireEvent.change(screen.getByLabelText("strategy.laps.proposal"), { target: { value: "exclude" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Spin affected pace" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(screen.getByText("strategy.data.pendingCount", { exact: false }).textContent).toBe("strategy.data.pendingCount 3");
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Review all" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    expect(save).toHaveBeenCalledOnce();
    const request = save.mock.calls[0][0];
    expect(request.corrections).toHaveLength(1);
    expect(request.familyUses).toHaveLength(1);
    expect(request.classifications).toHaveLength(1);
    expect(request.classifications?.[0]).toMatchObject({ field: "SessionType", expectedOriginal: "practice", replacement: "race" });
    expect(request.command.reason).toBe("Review all");
    expect(await screen.findByText("strategy.data.savedSeparately")).toBeTruthy();
    expect(session.opened.session.metadata).toEqual(metadataBefore);
    expect(client.project).not.toHaveBeenCalled();
    expect(onAdopt).not.toHaveBeenCalled();
  });
});
