import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAnalysisOpenedSession, parseCorrectionStoreResult, type AnalysisClassificationCorrection, type AnalysisMetadata, type AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { RecordedClassificationDetail, RecordedClassificationList, type RecordedClassificationForm } from "./StrategyRecordedClassification";

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
