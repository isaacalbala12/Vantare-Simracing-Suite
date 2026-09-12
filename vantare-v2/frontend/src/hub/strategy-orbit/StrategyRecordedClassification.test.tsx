import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAnalysisOpenedSession, parseCorrectionStoreResult, type AnalysisClassificationCorrection, type AnalysisCombination, type AnalysisMetadata, type AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import type { RecordedCombination } from "./strategy-recorded-wizard";
import { RecordedClassificationDetail, RecordedClassificationList, RecordedIdentityDetail, type RecordedClassificationForm, type RecordedIdentityForm } from "./StrategyRecordedClassification";

const t = (key: string) => key;
afterEach(() => { cleanup(); });
const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64), d = "d".repeat(64);
const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: b };

function sessionWith(metadata: AnalysisMetadata[]): RecordedSession {
  const opened = parseAnalysisOpenedSession({ sessionId: "handle", session: { schema_version: 1, id: "source", channels: [], metadata } });
  return { editableChannelIds: [], candidateId: "candidate", base, combinationId: undefined, opened, revision: { sessionId: "source", baseDigest: b, revisionId: a, snapshotId: a } };
}
function decision(field: "SessionType" | "WeatherConditions", expectedOriginal: string, replacement: string, reason: string): AnalysisClassificationCorrection {
  return { base, field, expectedOriginal, replacement, reason, provenance: "manual" };
}
function prepared(request: AnalysisClassificationCorrection, original: string, corrected: string) {
  return { baseId: a, correctionId: d, request, original, corrected };
}
function currentV1(): AnalysisStoreResult {
  return parseCorrectionStoreResult({ headId: a, revision: { revisionId: a, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: a, corrections: [] } } });
}
function currentWith(classifications: ReturnType<typeof prepared>[]): AnalysisStoreResult {
  return parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base, snapshotId: b, corrections: [], familyUses: [], classifications } } });
}
const valid = (key: string, value: string): AnalysisMetadata => ({ key, present: true, quality: "valid", sensitive: false, value });
function cells(row: HTMLElement) {
  return within(row).getAllByRole("cell").map(item => item.textContent);
}

const originalCombination: AnalysisCombination = { id: `lmu:${"1".repeat(64)}`, simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Oreca 07", carClass: "LMP2" };
const storedTarget: AnalysisCombination = { id: `lmu:${"3".repeat(64)}`, simId: "lmu", trackName: "Monza", trackLayout: "GP", carName: "Oreca 07", carClass: "LMP2" };
const outsiderTarget: AnalysisCombination = { id: `lmu:${"4".repeat(64)}`, simId: "lmu", trackName: "Portimao", trackLayout: "GP", carName: "Mustang GT3", carClass: "LMGT3" };
const proposedTarget: AnalysisCombination = { id: `lmu:${"6".repeat(64)}`, simId: "lmu", trackName: "Monza", trackLayout: "GP", carName: "Oreca 07", carClass: "LMP3" };
const catalogEntry: RecordedCombination = { combinationId: storedTarget.id, simId: "lmu", trackName: "Monza", trackLayout: "GP", carName: "Oreca 07", carClass: "LMP2" };
const catalogSecond: RecordedCombination = { combinationId: `lmu:${"5".repeat(64)}`, simId: "lmu", trackName: "Spa-Francorchamps", trackLayout: "Endurance", carName: "Mustang GT3", carClass: "LMGT3" };
const identityMetadata: AnalysisMetadata[] = [
  valid("TrackName", "Imola"), valid("TrackLayout", "GP"), valid("CarName", "Oreca 07"), valid("CarClass", "LMP2"),
];
function sessionWithCombination(metadata: AnalysisMetadata[], combination: AnalysisCombination | undefined): RecordedSession {
  const opened = parseAnalysisOpenedSession({ sessionId: "handle", session: { schema_version: 1, id: "source", channels: [], metadata } });
  return { editableChannelIds: [], candidateId: "candidate", base, combinationId: combination?.id, combination, opened, revision: { sessionId: "source", baseDigest: b, revisionId: a, snapshotId: a } };
}
function identityDecision(field: "TrackName" | "TrackLayout" | "CarName" | "CarClass", expectedOriginal: string, replacement: string, reference: string, reason = "Identity review"): AnalysisClassificationCorrection {
  return { base, field, expectedOriginal, replacement, reason, provenance: "manual", canonicalCombinationId: reference };
}
function currentV4(classifications: ReturnType<typeof prepared>[], target: AnalysisCombination): AnalysisStoreResult {
  return parseCorrectionStoreResult({ headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v4", base, snapshotId: b, corrections: [], familyUses: [], classifications, canonicalCombination: target } } });
}
const identityRow = () => {
  const row = screen.getAllByRole("row").find(item => within(item).queryAllByRole("cell")[0]?.textContent === "strategy.journey.step.combination");
  if (!row) throw new Error("identity row missing");
  return row;
};

describe("recorded classification list", () => {
  it("shows raw originals and the confirmed value without a proposal when identical", () => {
    const session = sessionWith([valid("SessionType", "race "), valid("WeatherConditions", "Dry")]);
    const request = decision("SessionType", "race ", "qualify", "Stewards bulletin");
    const current = currentWith([prepared(request, "race ", "qualify")]);
    const onSelect = vi.fn();
    render(<RecordedClassificationList session={session} current={current} proposals={[request]} locked={false} onSelect={onSelect} t={t} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map(item => item.textContent)).toEqual(["strategy.classification.tab", "strategy.data.original", "strategy.laps.saved", "strategy.laps.proposal"]);
    expect(cells(rows[1])).toEqual(["strategy.classification.field.SessionType", "race ", "qualify", "strategy.data.unchanged"]);
    expect(cells(rows[2])).toEqual(["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"]);
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.SessionType" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("SessionType");
  });
  it("shows a pending proposal only when it differs semantically from the saved request", () => {
    const session = sessionWith([valid("SessionType", "practice"), valid("WeatherConditions", "Dry")]);
    const saved = decision("SessionType", "practice", "race", "Stewards bulletin");
    const current = currentWith([prepared(saved, "practice", "race")]);
    const changed = { ...saved, replacement: "qualify", reason: "Amended" };
    const fresh = decision("WeatherConditions", "Dry", "Overcast", "Metar check");
    render(<RecordedClassificationList session={session} current={current} proposals={[changed, fresh]} locked={false} onSelect={vi.fn()} t={t} />);
    const rows = screen.getAllByRole("row");
    expect(cells(rows[1])).toEqual(["strategy.classification.field.SessionType", "practice", "race", "qualify"]);
    expect(cells(rows[2])).toEqual(["strategy.classification.field.WeatherConditions", "Dry", "Dry", "Overcast"]);
  });
  it("shows a pending withdrawal as the proposed original, not as a confirmation", () => {
    const session = sessionWith([valid("SessionType", "practice"), valid("WeatherConditions", "Dry")]);
    const saved = decision("SessionType", "practice", "race", "Stewards bulletin");
    const current = currentWith([prepared(saved, "practice", "race")]);
    render(<RecordedClassificationList session={session} current={current} proposals={[]} locked={false} onSelect={vi.fn()} t={t} />);
    const rows = screen.getAllByRole("row");
    expect(cells(rows[1])).toEqual(["strategy.classification.field.SessionType", "practice", "race", "practice"]);
    expect(cells(rows[2])).toEqual(["strategy.classification.field.WeatherConditions", "Dry", "Dry", "strategy.data.unchanged"]);
  });
  it("renders unavailable rows with the cause only while the other field stays editable", () => {
    const session = sessionWith([{ key: "SessionType", present: true, quality: "valid", sensitive: true }, valid("WeatherConditions", "Dry")]);
    const current = currentV1();
    const onSelect = vi.fn();
    render(<RecordedClassificationList session={session} current={current} proposals={[]} locked={false} onSelect={onSelect} t={t} />);
    expect(screen.getByText("strategy.classification.unavailable")).toBeTruthy();
    expect(screen.queryByText("practice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.WeatherConditions" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("WeatherConditions");
    expect(screen.queryByRole("button", { name: "strategy.classification.field.SessionType" })).toBeNull();
  });
  it("rejects duplicated and unknown originals without blocking staging of the valid field", () => {
    const onSelect = vi.fn();
    const duplicated = sessionWith([valid("sessiontype", "practice"), valid("SessionType", "practice"), valid("WeatherConditions", "Dry")]);
    const { unmount } = render(<RecordedClassificationList session={duplicated} current={currentV1()} proposals={[]} locked={false} onSelect={onSelect} t={t} />);
    expect(screen.getAllByText("strategy.classification.unavailable")).toHaveLength(1);
    expect(screen.queryByText("practice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.WeatherConditions" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("WeatherConditions");
    unmount();
    const unknownEnum = sessionWith([{ ...valid("SessionType", "banana") }, valid("WeatherConditions", "Dry")]);
    render(<RecordedClassificationList session={unknownEnum} current={currentV1()} proposals={[]} locked={false} onSelect={onSelect} t={t} />);
    expect(screen.getAllByText("strategy.classification.unavailable")).toHaveLength(1);
    expect(screen.queryByText("banana")).toBeNull();
  });
  it("disables staging while locked", () => {
    const session = sessionWith([valid("SessionType", "practice")]);
    const onSelect = vi.fn();
    render(<RecordedClassificationList session={session} current={currentV1()} proposals={[]} locked onSelect={onSelect} t={t} />);
    const button = screen.getByRole("button", { name: "strategy.classification.field.SessionType" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("recorded classification detail", () => {
  const sessionForm: RecordedClassificationForm = { field: "SessionType", choice: "correct", value: "race", reason: "", original: "  Race  " };
  it("keeps the raw original while the select offers the shared enum with localized labels", () => {
    const onChange = vi.fn();
    const { container } = render(<RecordedClassificationDetail form={sessionForm} dirty={false} locked={false} onChange={onChange} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect([...container.querySelectorAll("output")].map(item => item.textContent)).toContain("  Race  ");
    const select = screen.getByLabelText("strategy.data.correctedValue") as HTMLSelectElement;
    expect(select.value).toBe("race");
    expect([...select.options].map(item => [item.value, item.textContent])).toEqual([["practice", "strategy.classification.type.practice"], ["qualify", "strategy.classification.type.qualify"], ["race", "strategy.classification.type.race"]]);
    fireEvent.change(select, { target: { value: "qualify" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...sessionForm, value: "qualify" });
  });
  it("edits weather as opaque text with its hint and no enum select", () => {
    const onChange = vi.fn();
    render(<RecordedClassificationDetail form={{ field: "WeatherConditions", choice: "correct", value: "", reason: "", original: "Dry" }} dirty={false} locked={false} onChange={onChange} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.classification.weatherHint")).toBeTruthy();
    expect(screen.getByLabelText("strategy.data.correctedValue").tagName).toBe("INPUT");
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "Overcast" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ field: "WeatherConditions", choice: "correct", value: "Overcast", reason: "", original: "Dry" });
  });
  it("requires a reason, keeps the form on cancel and applies the chosen path", () => {
    const onApply = vi.fn(), onCancel = vi.fn(), onChange = vi.fn();
    const { rerender } = render(<RecordedClassificationDetail form={sessionForm} dirty={false} locked={false} onChange={onChange} onApply={onApply} onCancel={onCancel} t={t} />);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RecordedClassificationDetail form={{ ...sessionForm, reason: "Stewards bulletin" }} dirty locked={false} onChange={onChange} onApply={onApply} onCancel={onCancel} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(onApply).toHaveBeenCalledOnce();
    const choice = screen.getByLabelText("strategy.laps.proposal") as HTMLSelectElement;
    expect(choice.value).toBe("correct");
    expect([...choice.options].map(item => [item.value, item.textContent])).toEqual([["correct", "strategy.classification.correctValue"], ["original", "strategy.classification.restoreOriginal"]]);
    fireEvent.change(choice, { target: { value: "original" } });
    expect(onChange).toHaveBeenCalledWith({ ...sessionForm, reason: "Stewards bulletin", choice: "original" });
    fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("disables every input while locked", () => {
    render(<RecordedClassificationDetail form={{ ...sessionForm, reason: "Stewards bulletin" }} dirty locked onChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect((screen.getByLabelText("strategy.data.correctedValue") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("strategy.data.reason") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("recorded identity row", () => {
  it("shows the session original, the stored v4 target and a semantic proposal", () => {
    const session = sessionWithCombination([...identityMetadata, valid("SessionType", "practice"), valid("WeatherConditions", "Dry")], originalCombination);
    const saved = identityDecision("TrackName", "Imola", "Monza", storedTarget.id);
    const current = currentV4([prepared(saved, "Imola", "Monza")], storedTarget);
    // The active set describes proposedTarget atomically: every changed field
    // shares its canonical reference and its values match the stored tuple.
    const proposedTrack = identityDecision("TrackName", "Imola", "Monza", proposedTarget.id, "Reclassified entry");
    const proposedClass = identityDecision("CarClass", "LMP2", "LMP3", proposedTarget.id, "Reclassified entry");
    const onSelectIdentity = vi.fn();
    render(<RecordedClassificationList session={session} current={current} proposals={[proposedTrack, proposedClass]} locked={false} onSelect={vi.fn()} onSelectIdentity={onSelectIdentity} t={t} />);
    expect(cells(identityRow())).toEqual([
      "strategy.journey.step.combination",
      "Imola · GP — LMP2 · Oreca 07",
      "Monza · GP — LMP2 · Oreca 07",
      "Monza · GP — LMP3 · Oreca 07",
    ]);
    fireEvent.click(within(identityRow()).getByRole("button", { name: "strategy.journey.step.combination" }));
    expect(onSelectIdentity).toHaveBeenCalledOnce();
  });
  it("keeps a stored historical target readable and offers its withdrawal as the original", () => {
    const session = sessionWithCombination(identityMetadata, originalCombination);
    const saved = identityDecision("TrackName", "Imola", "Monza", storedTarget.id);
    const current = currentV4([prepared(saved, "Imola", "Monza")], storedTarget);
    render(<RecordedClassificationList session={session} current={current} proposals={[]} locked={false} onSelect={vi.fn()} onSelectIdentity={vi.fn()} t={t} />);
    expect(cells(identityRow())).toEqual([
      "strategy.journey.step.combination",
      "Imola · GP — LMP2 · Oreca 07",
      "Monza · GP — LMP2 · Oreca 07",
      "Imola · GP — LMP2 · Oreca 07",
    ]);
  });
  it("stays unchanged while the active set is semantically the stored one", () => {
    const session = sessionWithCombination(identityMetadata, originalCombination);
    const saved = identityDecision("TrackName", "Imola", "Monza", storedTarget.id);
    const current = currentV4([prepared(saved, "Imola", "Monza")], storedTarget);
    render(<RecordedClassificationList session={session} current={current} proposals={[saved]} locked={false} onSelect={vi.fn()} onSelectIdentity={vi.fn()} t={t} />);
    expect(cells(identityRow())[3]).toBe("strategy.data.unchanged");
  });
  it("ignores an isolated legacy decision for the identity proposal", () => {
    const session = sessionWithCombination([...identityMetadata, valid("SessionType", "practice"), valid("WeatherConditions", "Dry")], originalCombination);
    const legacy = decision("SessionType", "practice", "race", "Stewards bulletin");
    render(<RecordedClassificationList session={session} current={currentV1()} proposals={[legacy]} locked={false} onSelect={vi.fn()} onSelectIdentity={vi.fn()} t={t} />);
    expect(cells(identityRow())).toEqual([
      "strategy.journey.step.combination",
      "Imola · GP — LMP2 · Oreca 07",
      "Imola · GP — LMP2 · Oreca 07",
      "strategy.data.unchanged",
    ]);
  });
  it("reads the original as the saved value when no identity was stored", () => {
    const session = sessionWithCombination(identityMetadata, originalCombination);
    render(<RecordedClassificationList session={session} current={currentV1()} proposals={[]} locked={false} onSelect={vi.fn()} onSelectIdentity={vi.fn()} t={t} />);
    expect(cells(identityRow())).toEqual([
      "strategy.journey.step.combination",
      "Imola · GP — LMP2 · Oreca 07",
      "Imola · GP — LMP2 · Oreca 07",
      "strategy.data.unchanged",
    ]);
  });
  it("omits the identity row without a session combination while legacy stays editable", () => {
    const session = sessionWithCombination([valid("SessionType", "practice"), valid("WeatherConditions", "Dry")], undefined);
    const onSelect = vi.fn(), onSelectIdentity = vi.fn();
    render(<RecordedClassificationList session={session} current={currentV1()} proposals={[]} locked={false} onSelect={onSelect} onSelectIdentity={onSelectIdentity} t={t} />);
    expect(screen.queryByRole("button", { name: "strategy.journey.step.combination" })).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.field.WeatherConditions" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("WeatherConditions");
    expect(onSelectIdentity).not.toHaveBeenCalled();
  });
  it("keeps a stored v4 target readable even when the session combination is gone", () => {
    const session = sessionWithCombination(identityMetadata, undefined);
    const saved = identityDecision("TrackName", "Imola", "Monza", storedTarget.id);
    const current = currentV4([prepared(saved, "Imola", "Monza")], storedTarget);
    render(<RecordedClassificationList session={session} current={current} proposals={[]} locked={false} onSelect={vi.fn()} onSelectIdentity={vi.fn()} t={t} />);
    expect(cells(identityRow())).toEqual(["strategy.journey.step.combination", "strategy.classification.unavailable", "Monza · GP — LMP2 · Oreca 07", "strategy.data.unchanged"]);
    expect(within(identityRow()).queryByRole("button")).toBeNull();
  });
});

describe("recorded identity detail", () => {
  const form: RecordedIdentityForm = { choice: "correct", targetId: "", reason: "" };
  it("offers the original as restore plus catalog destinations only, never a stored outsider", () => {
    const onChange = vi.fn();
    render(<RecordedIdentityDetail form={form} original={originalCombination} saved={outsiderTarget} catalog={[catalogEntry, catalogSecond]} dirty={false} locked={false} onChange={onChange} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect([...document.querySelectorAll("output")].map(item => item.textContent)).toContain("Imola · GP — LMP2 · Oreca 07");
    expect(screen.getByText("strategy.laps.saved: Portimao · GP — LMGT3 · Mustang GT3")).toBeTruthy();
    const select = screen.getByLabelText("strategy.journey.step.combination") as HTMLSelectElement;
    expect([...select.options].map(item => item.value)).toEqual(["", catalogEntry.combinationId, catalogSecond.combinationId]);
    fireEvent.change(select, { target: { value: catalogSecond.combinationId } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...form, targetId: catalogSecond.combinationId });
  });
  it("hides the saved note once the stored target is a catalog destination", () => {
    render(<RecordedIdentityDetail form={form} original={originalCombination} saved={storedTarget} catalog={[catalogEntry, catalogSecond]} dirty={false} locked={false} onChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect(screen.queryByText(/strategy\.laps\.saved/)).toBeNull();
    expect([...(screen.getByLabelText("strategy.journey.step.combination") as HTMLSelectElement).options].map(item => item.value)).toContain(catalogEntry.combinationId);
  });
  it("requires the common reason and a catalog target for a correction, restore needs no target", () => {
    const onApply = vi.fn(), onChange = vi.fn();
    const { rerender } = render(<RecordedIdentityDetail form={form} original={originalCombination} catalog={[catalogEntry]} dirty locked={false} onChange={onChange} onApply={onApply} onCancel={vi.fn()} t={t} />);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RecordedIdentityDetail form={{ ...form, targetId: catalogEntry.combinationId, reason: "Identity review" }} original={originalCombination} catalog={[catalogEntry]} dirty locked={false} onChange={onChange} onApply={onApply} onCancel={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(onApply).toHaveBeenCalledOnce();
    const choice = screen.getByLabelText("strategy.laps.proposal") as HTMLSelectElement;
    expect([...choice.options].map(item => [item.value, item.textContent])).toEqual([["correct", "strategy.classification.correctValue"], ["original", "strategy.classification.restoreOriginal"]]);
    fireEvent.change(choice, { target: { value: "original" } });
    expect(onChange).toHaveBeenLastCalledWith({ choice: "original", targetId: catalogEntry.combinationId, reason: "Identity review" });
    rerender(<RecordedIdentityDetail form={{ choice: "original", targetId: "", reason: "Identity review" }} original={originalCombination} catalog={[]} dirty locked={false} onChange={onChange} onApply={onApply} onCancel={vi.fn()} t={t} />);
    expect(screen.getByText("strategy.journey.catalog.empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect(onApply).toHaveBeenCalledTimes(2);
  });
  it("locks every control while locked", () => {
    render(<RecordedIdentityDetail form={{ ...form, reason: "Identity review" }} original={originalCombination} catalog={[catalogEntry]} dirty locked onChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} t={t} />);
    expect((screen.getByLabelText("strategy.laps.proposal") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("strategy.journey.step.combination") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("strategy.data.reason") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "strategy.data.apply" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
