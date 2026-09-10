import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import { parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import type { AnalysisClassificationCorrection, AnalysisFamilyCorrection, AnalysisLapPage, AnalysisMetadata, AnalysisPage, AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { useRecordedCorrections } from "./use-recorded-corrections";
afterEach(cleanup);
const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64), d = "d".repeat(64);
function fixture() {
  const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
  const channel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const session: RecordedSession = { editableChannelIds: ["fuel"], candidateId: "candidate", opened: { sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [] } }, base, combinationId: "combo", revision: { sessionId: "source", baseDigest: c, revisionId: a, snapshotId: a } };
  const current: AnalysisStoreResult = { headId: a, revision: { revisionId: a, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: a, corrections: [] } } };
  const page: AnalysisPage = { channel_id: "fuel", start: 0, sampling: channel.sampling, samples: [{ index: 4, values: [{ column: "value", present: true, quality: "unknown", scalar: { kind: "number", number: 12 } }] }] };
  const saved = (request: AnalysisSaveRequest): AnalysisStoreResult => ({ headId: b, revision: { revisionId: b, parentRevisionId: a, command: request.command, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { ...current.revision.snapshot, snapshotId: b, contractVersion: request.classifications?.length ? "analysis.mixed-snapshot.v3" : request.familyUses?.length ? "analysis.observation-snapshot.v2" : "analysis.sample-snapshot.v1", familyUses: request.familyUses?.map(item => ({ baseId: c, correctionId: b, request: item, original: item.expected, corrected: { ...item.expected, included: item.included, exclusionReasons: item.included ? [] : [...(item.expected.exclusionReasons ?? []), "manual_exclusion"] } })), classifications: request.classifications?.map(item => ({ baseId: c, correctionId: b, request: item, original: item.expectedOriginal, corrected: item.replacement })), corrections: request.corrections.map(item => ({ baseId: c, correctionId: b, request: item, original: item.expected, corrected: { ...item.expected, scalar: item.replacement } })) } } });
  const client = { laps: vi.fn(), resolve: vi.fn(), load: vi.fn().mockResolvedValue(current), page: vi.fn().mockResolvedValue(page), save: vi.fn().mockImplementation(async (request: AnalysisSaveRequest) => saved(request)), project: vi.fn().mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...session.revision, revisionId: b, snapshotId: b }] }), close: vi.fn() };
  const onAdopt = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useRecordedCorrections(client as unknown as AnalysisClient, onAdopt));
  async function edit() {
    await act(() => hook.result.current.load(session));
    await act(() => hook.result.current.page("fuel", 0));
    act(() => hook.result.current.edit(4, "value", { kind: "number", number: 0 }, "Checked sample"));
  }
  return { ...hook, client, onAdopt, session, current, saved, edit };
}
describe("recorded corrections owner", () => {
  it("resolves a durable command without replaying it or adopting the current head", async () => {
    const f = fixture();
    f.client.save.mockRejectedValueOnce(new Error("confirmation lost"));
    await f.edit();
    await act(() => f.result.current.save("Checked"));
    const request = f.result.current.editor!.request!;
    f.client.resolve.mockResolvedValue({ found: true, headId: c, revision: f.saved(request).revision });
    await act(() => f.result.current.resolveSave());
    expect(f.client.save).toHaveBeenCalledTimes(1);
    expect(f.client.resolve).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    expect(f.result.current.editor?.current.headId).toBe(c);
    expect(f.result.current.editor?.projected?.revision.revisionId).toBe(b);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.onAdopt).not.toHaveBeenCalled();
  });
  it("unfreezes confirmed absence, retaining edits and exposing a conflict without rebasing", async () => {
    const f = fixture();
    f.client.save.mockRejectedValueOnce(new Error("conflict"));
    await f.edit();
    await act(() => f.result.current.save("Checked"));
    f.client.resolve.mockResolvedValue({ found: false, headId: b });
    await act(() => f.result.current.resolveSave());
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.dirty).toBe(true);
    expect(f.result.current.editor?.corrections[0].replacement.number).toBe(0);
    expect(f.result.current.editor?.current.revision.revisionId).toBe(a);
    expect(f.result.current.error).toBe("recorded_revision_conflict");
    await act(() => f.result.current.save("Again"));
    expect(f.client.save).toHaveBeenCalledTimes(1);
    act(() => f.result.current.discard());
    f.client.load.mockResolvedValue({ ...f.current, headId: b, revision: { ...f.current.revision, revisionId: b } });
    await act(() => f.result.current.head());
    expect(f.result.current.editor?.current.revision.revisionId).toBe(b);
    expect(f.onAdopt).not.toHaveBeenCalled();
  });
  it("clears only settled state and leaves handle ownership outside this hook", async () => {
    const f = fixture();
    await f.edit();
    act(() => expect(f.result.current.clear()).toBe(false));
    expect(f.result.current.editor).not.toBeNull();
    act(() => f.result.current.discard());
    act(() => expect(f.result.current.clear("another-handle")).toBe(true));
    expect(f.result.current.editor).not.toBeNull();
    act(() => expect(f.result.current.clear("handle")).toBe(true));
    expect(f.result.current.editor).toBeNull();
    expect(f.client.close).not.toHaveBeenCalled();
  });
  it("keeps original reads and pending edits separate, then saves/projects before explicit adoption", async () => {
    const f = fixture();
    expect(f.client.load).not.toHaveBeenCalled();
    await f.edit();
    expect(f.result.current.editor?.page?.samples[0].values[0].scalar.number).toBe(12);
    expect(f.result.current.editor?.corrections[0].replacement.number).toBe(0);
    expect(f.result.current.unresolved).toBe(true);
    await act(() => f.result.current.save("Reviewed fuel sample"));
    expect(f.result.current.error).toBe("");
    expect(f.result.current.editor?.saved?.revision.revisionId).toBe(b);
    expect(f.onAdopt).not.toHaveBeenCalled();
    await act(() => f.result.current.adopt());
    expect(f.onAdopt).toHaveBeenCalledWith(expect.objectContaining({ revision: expect.objectContaining({ revisionId: b }) }), expect.any(AbortSignal));
    expect(f.result.current.unresolved).toBe(false);
    expect(f.client.close).not.toHaveBeenCalled();
  });
  it("retries the identical command after uncertain save and freezes its payload", async () => {
    const f = fixture();
    f.client.save.mockRejectedValueOnce(new Error("confirmation lost"));
    await f.edit();
    await act(() => f.result.current.save("Checked"));
    const request = f.result.current.editor?.request;
    expect(request).toBeTruthy();
    act(() => f.result.current.edit(4, "value", { kind: "number", number: 99 }, "Changed"));
    act(() => f.result.current.discard());
    await act(() => f.result.current.load(f.session));
    expect(f.result.current.editor?.request).toBe(request);
    expect(f.result.current.editor?.corrections[0].replacement.number).toBe(0);
    await act(() => f.result.current.retrySave());
    expect(f.client.save.mock.calls[0][0]).toBe(f.client.save.mock.calls[1][0]);
    expect(f.result.current.editor?.request).toBeUndefined();
  });
  it("retains a durable revision after projection failure and only retries projection", async () => {
    const f = fixture();
    f.client.project.mockRejectedValueOnce(new Error("projection unavailable"));
    await f.edit();
    await act(() => f.result.current.save("Checked"));
    expect(f.result.current.editor?.saved?.revision.revisionId).toBe(b);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.projected).toBeUndefined();
    await act(() => f.result.current.project());
    expect(f.client.save).toHaveBeenCalledTimes(1);
    expect(f.client.project).toHaveBeenCalledTimes(2);
    expect(f.result.current.editor?.projected?.revision.revisionId).toBe(b);
  });
  it("requires explicit head review before editing a historical revision and restores as a new command", async () => {
    const f = fixture();
    f.client.load.mockResolvedValue({ ...f.current, headId: b });
    await f.edit();
    await act(() => f.result.current.save("Checked"));
    expect(f.client.save).not.toHaveBeenCalled();
    expect(f.result.current.error).toBe("recorded_revision_conflict");
    act(() => f.result.current.discard());
    f.client.load.mockResolvedValue({ ...f.current, headId: b, revision: { ...f.current.revision, revisionId: b } });
    await act(() => f.result.current.restore("Restore original values"));
    expect(f.client.save).toHaveBeenCalledWith(expect.objectContaining({ corrections: [], command: expect.objectContaining({ expectedRevision: b, reason: "Restore original values" }) }), expect.any(AbortSignal));
  });
  it("does not publish a late load after cancellation or close handles on unmount", async () => {
    const f = fixture();
    let finish!: (value: AnalysisStoreResult) => void;
    f.client.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = f.result.current.load(f.session); });
    act(() => f.result.current.cancel());
    await act(async () => { finish(f.current); await pending; });
    expect(f.result.current.editor).toBeNull();
    f.unmount();
    expect(f.client.close).not.toHaveBeenCalled();
  });
  it("preserves the command when a save is cancelled after dispatch", async () => {
    const f = fixture();
    await f.edit();
    let finish!: (value: AnalysisStoreResult) => void;
    f.client.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = f.result.current.save("Checked"); });
    const request = f.result.current.editor!.request!;
    act(() => f.result.current.cancel());
    await act(async () => { finish(f.saved(request)); await pending; });
    expect(f.result.current.editor?.request).toBe(request);
    expect(f.result.current.editor?.saved).toBeUndefined();
    expect(f.client.project).not.toHaveBeenCalled();
  });
});

function classDecision(base: ReturnType<typeof fixture>["session"]["base"], field: "SessionType" | "WeatherConditions", expectedOriginal: string, replacement: string): AnalysisClassificationCorrection {
  return { base, field, expectedOriginal, replacement, reason: "Stewards bulletin", provenance: "manual" };
}
function preparedClass(decision: AnalysisClassificationCorrection, corrected: string) {
  return { baseId: c, correctionId: b, request: decision, original: decision.expectedOriginal, corrected };
}
function sessionWithMetadata(session: ReturnType<typeof fixture>["session"], metadata: AnalysisMetadata[]) {
  return { ...session, opened: { ...session.opened, session: { ...session.opened.session, metadata } } };
}
function openMetadata(): AnalysisMetadata[] {
  return [
    { key: "SessionType", present: true, quality: "valid", sensitive: false, value: "practice" },
    { key: "WeatherConditions", present: true, quality: "valid", sensitive: false, value: "Dry" },
  ];
}
// Coherent fresh save after the given request: a new revision whose parent is
// the request's expected revision, echoing all three groups it carried.
function savedAfter(base: ReturnType<typeof fixture>["session"]["base"], request: AnalysisSaveRequest, revisionId: string): AnalysisStoreResult {
  return { headId: revisionId, revision: { revisionId, parentRevisionId: request.command.expectedRevision, command: request.command, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: request.classifications?.length ? "analysis.mixed-snapshot.v3" : request.familyUses?.length ? "analysis.observation-snapshot.v2" : "analysis.sample-snapshot.v1", base, snapshotId: revisionId, corrections: request.corrections.map((item, index) => ({ baseId: c, correctionId: (index + 1).toString(16).padStart(64, "0"), request: item, original: item.expected, corrected: { ...item.expected, scalar: item.replacement } })), familyUses: request.familyUses?.map(item => ({ baseId: c, correctionId: b, request: item, original: item.expected, corrected: { ...item.expected, included: item.included, exclusionReasons: item.included ? [] : [...(item.expected.exclusionReasons ?? []), "manual_exclusion"] } })), classifications: request.classifications?.map(item => ({ baseId: c, correctionId: b, request: item, original: item.expectedOriginal, corrected: item.replacement })) } } };
}

describe("recorded classification restore", () => {
  it("restoring a v1 ancestor before a saved v3 head sends empty classifications", async () => {
    const f = fixture();
    const session = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    const decision = classDecision(f.session.base, "SessionType", "practice", "race");
    const head: AnalysisStoreResult = { headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: [], familyUses: [], classifications: [preparedClass(decision, "race")] } } };
    expect(parseCorrectionStoreResult(head)).toBe(head);
    expect(parseCorrectionStoreResult(f.current)).toBe(f.current);
    f.client.load.mockImplementation(async ({ revisionId }: { revisionId: string }) => (revisionId === b ? head : { ...f.current, headId: b }));
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = savedAfter(f.session.base, request, d);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    f.client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...session.revision, revisionId: d, snapshotId: d }] });
    await act(() => f.result.current.load(session));
    await act(() => f.result.current.restore("Restore ancestor"));
    const sent = f.client.save.mock.calls[0][0] as AnalysisSaveRequest;
    expect(sent.command.expectedRevision).toBe(b);
    expect(sent.classifications).toEqual([]);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.current.revision.revisionId).toBe(d);
    expect(f.result.current.editor?.projected?.revision.revisionId).toBe(d);
    expect(f.onAdopt).not.toHaveBeenCalled();
  });
  it("restoring a v2 ancestor keeps its families while emptying classifications", async () => {
    const f = fixture(), lap = lapFixture(f);
    const session = sessionWithMetadata(f.session, openMetadata());
    const ancestor: AnalysisStoreResult = { headId: b, revision: { revisionId: a, parentRevisionId: c, command: { expectedRevision: c, commandId: "mixed", reason: "Checked", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.observation-snapshot.v2", base: f.session.base, snapshotId: a, corrections: [], familyUses: [{ baseId: c, correctionId: b, request: lap.correction, original: lap.correction.expected, corrected: { ...lap.correction.expected, included: false, exclusionReasons: ["manual_exclusion"] } }] } } };
    const headDecision = classDecision(f.session.base, "SessionType", "practice", "race");
    const head: AnalysisStoreResult = { headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: [], familyUses: [], classifications: [preparedClass(headDecision, "race")] } } };
    expect(parseCorrectionStoreResult(ancestor)).toBe(ancestor);
    expect(parseCorrectionStoreResult(head)).toBe(head);
    f.client.load.mockImplementation(async ({ revisionId }: { revisionId: string }) => (revisionId === b ? head : ancestor));
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = savedAfter(f.session.base, request, d);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    f.client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...session.revision, revisionId: d, snapshotId: d }] });
    await act(() => f.result.current.load(session, a));
    await act(() => f.result.current.restore("Restore families"));
    const sent = f.client.save.mock.calls[0][0] as AnalysisSaveRequest;
    expect(sent.command.expectedRevision).toBe(b);
    expect(sent.familyUses).toEqual([lap.correction]);
    expect(sent.classifications).toEqual([]);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.current.revision.revisionId).toBe(d);
  });
  it("restoring a v3 ancestor sends its own classifications, not the head's", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    const oldDecision = classDecision(f.session.base, "SessionType", "practice", "qualify");
    const ancestor: AnalysisStoreResult = { headId: b, revision: { revisionId: a, parentRevisionId: c, command: { expectedRevision: c, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: a, corrections: [], familyUses: [], classifications: [preparedClass(oldDecision, "qualify")] } } };
    const headDecision = classDecision(f.session.base, "SessionType", "practice", "race");
    const head: AnalysisStoreResult = { headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: [], familyUses: [], classifications: [preparedClass(headDecision, "race")] } } };
    expect(parseCorrectionStoreResult(ancestor)).toBe(ancestor);
    expect(parseCorrectionStoreResult(head)).toBe(head);
    f.client.load.mockImplementation(async ({ revisionId }: { revisionId: string }) => (revisionId === b ? head : ancestor));
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = savedAfter(f.session.base, request, d);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    f.client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...session.revision, revisionId: d, snapshotId: d }] });
    await act(() => f.result.current.load(session, a));
    await act(() => f.result.current.restore("Restore classes"));
    const sent = f.client.save.mock.calls[0][0] as AnalysisSaveRequest;
    expect(sent.command.expectedRevision).toBe(b);
    expect(sent.classifications).toEqual([oldDecision]);
    expect(sent.classifications?.[0]).not.toBe(oldDecision);
  });
});

function scalarPreparations(base: ReturnType<typeof fixture>["session"]["base"], count: number) {
  return Array.from({ length: count }, (_, index) => {
    const request = { base, target: { channelId: "fuel", column: "value", sampleIndex: index }, unit: { symbol: "L", quality: "valid" as const }, expected: { column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: index } }, replacement: { kind: "number" as const, number: -index }, reason: "bulk" };
    return { baseId: c, correctionId: (index + 1).toString(16).padStart(64, "0"), request, original: structuredClone(request.expected), corrected: { ...structuredClone(request.expected), scalar: structuredClone(request.replacement) } };
  });
}

describe("recorded classification editor", () => {
  it("edits from the open original even when the current revision is effective", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    const raced = classDecision(f.session.base, "SessionType", "practice", "race");
    const current3: AnalysisStoreResult = { headId: a, revision: { revisionId: a, parentRevisionId: c, command: { expectedRevision: c, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: a, corrections: [], familyUses: [], classifications: [preparedClass(raced, "race")] } } };
    expect(parseCorrectionStoreResult(current3)).toBe(current3);
    f.client.load.mockResolvedValue(current3);
    await act(() => f.result.current.load(session, a));
    expect(f.result.current.editor?.classifications).toEqual([raced]);
    act(() => expect(f.result.current.editClassification("SessionType", "qualify", "Amended")).toBe(true));
    expect(f.result.current.editor?.classifications).toEqual([{ ...raced, replacement: "qualify", reason: "Amended" }]);
    act(() => expect(f.result.current.editClassification("SessionType", "sprint", "Bad enum")).toBe(false));
    expect(f.result.current.error).not.toBe("");
    expect(f.result.current.editor?.classifications).toEqual([{ ...raced, replacement: "qualify", reason: "Amended" }]);
    act(() => expect(f.result.current.removeClassification("SessionType")).toBe(true));
    expect(f.result.current.editor?.classifications).toEqual([]);
    expect(f.result.current.editor?.dirty).toBe(true);
  });
  it("rejects classification edits without an open original", async () => {
    const f = fixture();
    await act(() => f.result.current.load(f.session));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "ok")).toBe(false));
    expect(f.result.current.error).toBe("recorded_target_unavailable");
    expect(f.result.current.editor?.classifications).toEqual([]);
  });
  it("discards classification edits back to the loaded revision", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    const raced = classDecision(f.session.base, "SessionType", "practice", "race");
    const current3: AnalysisStoreResult = { headId: a, revision: { revisionId: a, parentRevisionId: c, command: { expectedRevision: c, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: a, corrections: [], familyUses: [], classifications: [preparedClass(raced, "race")] } } };
    expect(parseCorrectionStoreResult(current3)).toBe(current3);
    f.client.load.mockResolvedValue(current3);
    await act(() => f.result.current.load(session, a));
    act(() => expect(f.result.current.editClassification("WeatherConditions", "Overcast", "Metar")).toBe(true));
    expect(f.result.current.editor?.classifications).toHaveLength(2);
    act(() => f.result.current.discard());
    expect(f.result.current.editor?.classifications).toEqual([raced]);
    expect(f.result.current.editor?.dirty).toBe(false);
  });
  it("counts the three groups in one quota before publishing classification edits", async () => {
    const f = fixture(), lap = lapFixture(f);
    const session = sessionWithMetadata(f.session, openMetadata());
    const decision = classDecision(f.session.base, "SessionType", "practice", "race");
    const preparedFamily = { baseId: c, correctionId: b, request: lap.correction, original: lap.correction.expected, corrected: { ...lap.correction.expected, included: false, exclusionReasons: ["manual_exclusion"] } };
    const full: AnalysisStoreResult = { headId: b, revision: { revisionId: b, parentRevisionId: a, command: { expectedRevision: a, commandId: "bulk", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: b, corrections: scalarPreparations(f.session.base, 254), familyUses: [preparedFamily], classifications: [preparedClass(decision, "race")] } } };
    const roomy: AnalysisStoreResult = { headId: c, revision: { revisionId: c, parentRevisionId: a, command: { expectedRevision: a, commandId: "bulk", reason: "Reviewed", localAuthorId: "local" }, commandDigest: c, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base: f.session.base, snapshotId: c, corrections: scalarPreparations(f.session.base, 253), familyUses: [preparedFamily], classifications: [preparedClass(decision, "race")] } } };
    expect(parseCorrectionStoreResult(full)).toBe(full);
    expect(parseCorrectionStoreResult(roomy)).toBe(roomy);
    f.client.load.mockImplementation(async ({ revisionId }: { revisionId: string }) => (revisionId === c ? roomy : full));
    await act(() => f.result.current.load(session, b));
    act(() => expect(f.result.current.editClassification("WeatherConditions", "Overcast", "Metar")).toBe(false));
    expect(f.result.current.error).toBe("recorded_correction_limit");
    expect(f.result.current.editor?.classifications).toEqual([decision]);
    await act(() => f.result.current.load(session, c));
    act(() => expect(f.result.current.editClassification("WeatherConditions", "Overcast", "Metar")).toBe(true));
    expect(f.result.current.editor?.classifications).toHaveLength(2);
  });
  it("saves the three explicit groups together", async () => {
    const f = fixture(), lap = lapFixture(f);
    const session = sessionWithMetadata(f.session, openMetadata());
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = f.saved(request);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    await act(() => f.result.current.load(session));
    await act(() => f.result.current.page("fuel", 0));
    act(() => f.result.current.edit(4, "value", { kind: "number", number: 0 }, "Checked sample"));
    await act(() => f.result.current.laps());
    act(() => expect(f.result.current.editFamily(lap.target, lap.family, false, "Reviewed pace")).toBe(true));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    await act(() => f.result.current.save("All reviewed"));
    const sent = f.client.save.mock.calls[0][0] as AnalysisSaveRequest;
    expect(sent.corrections).toHaveLength(1);
    expect(sent.familyUses).toEqual([lap.correction]);
    expect(sent.classifications).toHaveLength(1);
    expect(sent.classifications?.[0]).toMatchObject({ field: "SessionType", expectedOriginal: "practice", replacement: "race" });
    expect(f.result.current.editor?.saved?.revision.snapshot.classifications).toHaveLength(1);
    expect(f.result.current.editor?.request).toBeUndefined();
  });
  it("accepts a found older revision with an advanced head", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    f.client.save.mockRejectedValueOnce(new Error("confirmation lost"));
    await act(() => f.result.current.load(session));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    await act(() => f.result.current.save("Checked"));
    const request = f.result.current.editor!.request!;
    expect(request.classifications).toHaveLength(1);
    const response = f.saved(request);
    expect(parseCorrectionStoreResult(response)).toBe(response);
    f.client.resolve.mockResolvedValue({ found: true, headId: c, revision: response.revision });
    await act(() => f.result.current.resolveSave());
    expect(f.client.save).toHaveBeenCalledTimes(1);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.current.headId).toBe(c);
    expect(f.result.current.editor?.current.revision.revisionId).toBe(b);
    expect(f.result.current.editor?.classifications).toHaveLength(1);
    expect(f.result.current.editor?.projected?.revision.revisionId).toBe(b);
    expect(f.onAdopt).not.toHaveBeenCalled();
  });
  it("keeps the classification proposal when the command is absent", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    f.client.save.mockRejectedValueOnce(new Error("conflict"));
    await act(() => f.result.current.load(session));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    await act(() => f.result.current.save("Checked"));
    f.client.resolve.mockResolvedValue({ found: false, headId: b });
    await act(() => f.result.current.resolveSave());
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.dirty).toBe(true);
    expect(f.result.current.editor?.classifications).toHaveLength(1);
    expect(f.result.current.editor?.current.revision.revisionId).toBe(a);
    expect(f.result.current.error).toBe("recorded_revision_conflict");
    await act(() => f.result.current.save("Again"));
    expect(f.client.save).toHaveBeenCalledTimes(1);
  });
  it("retains the classified save when projection fails and only retries projection", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    f.client.project.mockRejectedValueOnce(new Error("projection unavailable"));
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = f.saved(request);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    await act(() => f.result.current.load(session));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    await act(() => f.result.current.save("Checked"));
    expect(f.result.current.editor?.saved?.revision.snapshot.classifications).toHaveLength(1);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.projected).toBeUndefined();
    await act(() => f.result.current.project());
    expect(f.client.save).toHaveBeenCalledTimes(1);
    expect(f.result.current.editor?.projected?.revision.revisionId).toBe(b);
  });
  it("retries the identical three-group command and freezes its payload", async () => {
    const f = fixture(), lap = lapFixture(f);
    const session = sessionWithMetadata(f.session, openMetadata());
    f.client.save.mockRejectedValueOnce(new Error("confirmation lost"));
    f.client.save.mockImplementation(async (request: AnalysisSaveRequest) => {
      const response = f.saved(request);
      expect(parseCorrectionStoreResult(response)).toBe(response);
      return response;
    });
    await act(() => f.result.current.load(session));
    await act(() => f.result.current.page("fuel", 0));
    act(() => f.result.current.edit(4, "value", { kind: "number", number: 0 }, "Checked sample"));
    await act(() => f.result.current.laps());
    act(() => expect(f.result.current.editFamily(lap.target, lap.family, false, "Reviewed pace")).toBe(true));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    await act(() => f.result.current.save("Checked"));
    const request = f.result.current.editor?.request;
    expect(request?.corrections).toHaveLength(1);
    expect(request?.familyUses).toEqual([lap.correction]);
    expect(request?.classifications).toHaveLength(1);
    const frozen = structuredClone(request);
    act(() => expect(f.result.current.editClassification("WeatherConditions", "Overcast", "Metar")).toBe(false));
    act(() => expect(f.result.current.removeClassification("SessionType")).toBe(false));
    act(() => expect(f.result.current.discard()).toBe(false));
    await act(() => f.result.current.load(session));
    expect(f.result.current.editor?.request).toBe(request);
    expect(f.result.current.editor?.request).toEqual(frozen);
    await act(() => f.result.current.retrySave());
    expect(f.client.save.mock.calls[0][0]).toBe(f.client.save.mock.calls[1][0]);
    expect(f.result.current.editor?.request).toBeUndefined();
    expect(f.result.current.editor?.corrections).toHaveLength(1);
    expect(f.result.current.editor?.familyUses).toEqual([lap.correction]);
    expect(f.result.current.editor?.classifications).toHaveLength(1);
  });
  it("retains the classified command when a save is cancelled after dispatch", async () => {
    const f = fixture();
    const session = sessionWithMetadata(f.session, openMetadata());
    await act(() => f.result.current.load(session));
    act(() => expect(f.result.current.editClassification("SessionType", "race", "Stewards bulletin")).toBe(true));
    let finish!: (value: AnalysisStoreResult) => void;
    f.client.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = f.result.current.save("Checked"); });
    const request = f.result.current.editor!.request!;
    expect(request.classifications).toHaveLength(1);
    act(() => f.result.current.cancel());
    const response = f.saved(request);
    expect(parseCorrectionStoreResult(response)).toBe(response);
    await act(async () => { finish(response); await pending; });
    expect(f.result.current.editor?.request).toBe(request);
    expect(f.result.current.editor?.saved).toBeUndefined();
    expect(f.client.project).not.toHaveBeenCalled();
  });
});

function lapFixture(f: ReturnType<typeof fixture>) {
  const target = { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
  const family = "combined_stint_pace_curve" as const;
  const use = { family, included: true, exclusionReasons: null };
  const original = { ...target, complete: true, labels: [], familyUse: [use] };
  const lapPage: AnalysisLapPage = { revisionId: a, headId: a, page: { base: f.session.base, snapshotId: a, start: 0, total: 1, laps: [{ original, effective: structuredClone(original), target, capabilities: [{ family, automaticIncluded: true, effectiveIncluded: true, canInclude: true, canExclude: true }] }] } };
  const correction: AnalysisFamilyCorrection = { base: f.session.base, target, family, expected: use, included: false, reason: "Reviewed pace" };
  f.client.laps.mockResolvedValue(lapPage);
  return { target, family, lapPage, correction };
}

describe("recorded mixed editor", () => {
  it("retains mixed edits across lost acknowledgement, resolves absence and retries the complete set", async () => {
    const f = fixture(), lap = lapFixture(f);
    await f.edit();
    await act(() => f.result.current.laps());
    act(() => expect(f.result.current.editFamily(lap.target, lap.family, false, "Reviewed pace")).toBe(true));
    f.client.save.mockRejectedValueOnce(new Error("confirmation lost"));
    await act(() => f.result.current.save("Both reviewed"));
    const request = f.result.current.editor!.request!;
    expect(request.familyUses).toEqual([lap.correction]);
    expect(request.corrections).toHaveLength(1);
    act(() => expect(f.result.current.removeFamily(lap.target, lap.family)).toBe(false));
    f.client.resolve.mockResolvedValue({ found: false, headId: a });
    await act(() => f.result.current.resolveSave());
    expect(f.result.current.editor?.familyUses).toEqual([lap.correction]);
    await act(() => f.result.current.save("Both reviewed"));
    expect(f.client.save.mock.calls[1][0].familyUses).toEqual(request.familyUses);
    expect(f.result.current.editor?.lapPage).toBeUndefined();
    expect(f.result.current.editor?.familyUses).toEqual([lap.correction]);
    expect(f.result.current.unresolved).toBe(false);
  });
  it("returns one family to automatic, discards back to its saved value, and restores a scalar-only ancestor", async () => {
    const f = fixture(), lap = lapFixture(f);
    const mixed = f.saved({ sessionId: "handle", base: f.session.base, corrections: [], familyUses: [lap.correction], command: { expectedRevision: a, commandId: "mixed", reason: "Checked", localAuthorId: "local-user" } });
    f.client.load.mockResolvedValue(mixed);
    await act(() => f.result.current.load(f.session, b));
    act(() => f.result.current.removeFamily(lap.target, lap.family));
    expect(f.result.current.editor?.familyUses).toEqual([]);
    act(() => f.result.current.discard());
    expect(f.result.current.editor?.familyUses).toEqual([lap.correction]);
    f.client.load.mockResolvedValueOnce({ ...f.current, headId: b }).mockResolvedValueOnce(mixed);
    await act(() => f.result.current.load(f.session, a));
    await act(() => f.result.current.restore("Restore ancestor"));
    expect(f.client.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ familyUses: [], corrections: [], command: expect.objectContaining({ expectedRevision: b }) }), expect.any(AbortSignal));
  });
  it("reports a newer head from inspection without moving the selected revision or accepting a stale page", async () => {
    const f = fixture(), lap = lapFixture(f);
    await act(() => f.result.current.load(f.session));
    f.client.laps.mockResolvedValueOnce({ ...lap.lapPage, headId: b });
    await act(() => f.result.current.laps());
    expect(f.result.current.editor?.current.revision.revisionId).toBe(a);
    expect(f.result.current.editor?.current.headId).toBe(b);
    expect(f.onAdopt).not.toHaveBeenCalled();
    f.client.laps.mockResolvedValueOnce({ ...lap.lapPage, revisionId: b });
    await act(() => f.result.current.laps());
    expect(f.result.current.error).toBe("recorded_revision_mismatch");
    expect(f.result.current.editor?.lapPage?.revisionId).toBe(a);
  });
});
