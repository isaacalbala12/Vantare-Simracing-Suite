import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisFamilyCorrection, AnalysisLapPage, AnalysisBase, AnalysisPage, AnalysisScalar, AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { loadRecordedLapPage, recordedFamilyCorrection, replaceRecordedFamilyCorrection, removeRecordedFamilyCorrection, loadRecordedCorrection, projectRecordedCorrection, recordedCorrectionSave, recordedSampleCorrection, replaceRecordedCorrection } from "./strategy-recorded-corrections";

const base: AnalysisBase = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: "b".repeat(64) };
const initial = "c".repeat(64), next = "d".repeat(64), digest = "e".repeat(64);
function fixture(kind: AnalysisScalar["kind"] = "number") {
  const channel = { id: "fuel", source_name: "Fuel", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: kind }] };
  const session: RecordedSession = { editableChannelIds: ["fuel"], candidateId: "opaque", opened: { sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [] } }, base, combinationId: "combo", revision: { sessionId: "source", baseDigest: digest, revisionId: initial, snapshotId: initial } };
  const page: AnalysisPage = { channel_id: "fuel", start: 100, sampling: channel.sampling, samples: [{ index: 107, values: [{ column: "value", present: true, quality: "unknown", scalar: { kind, ...(kind === "number" ? { number: 12 } : {}) } }] }] };
  const loaded: AnalysisStoreResult = { headId: initial, revision: { revisionId: initial, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: initial, corrections: [] } } };
  const correction = () => recordedSampleCorrection(session, page, 107, "value", { kind, ...(kind === "number" ? { number: 0 } : {}) }, "Reviewed observation");
  return { session, page, loaded, correction };
}

describe("recorded scalar correction commands", () => {
  it("rejects readable channels without explicit native edit capability", () => {
    const { session, page } = fixture();
    for (const editableChannelIds of [undefined, [], ["other"]]) {
      expect(() => recordedSampleCorrection({ ...session, editableChannelIds }, page, 107, "value", { kind: "number", number: 0 }, "Reviewed")).toThrow("recorded_channel_read_only");
    }
  });
  it.each(["number", "boolean"] as const)("preserves explicit zero/false and original quality for %s", kind => {
    const { correction, page } = fixture(kind);
    const value = correction();
    expect(value.target.sampleIndex).toBe(107);
    expect(value.expected.quality).toBe("unknown");
    expect(value.expected).toEqual(page.samples[0].values[0]);
    expect(value.replacement).toEqual(kind === "number" ? { kind, number: 0 } : { kind });
    expect(value.expected).not.toBe(page.samples[0].values[0]);
  });
  it("rejects missing targets, missing values, unknown units and absent reasons", () => {
    const { session, page } = fixture();
    const make = (s = session, p = page, index = 107, reason = "reviewed") => recordedSampleCorrection(s, p, index, "value", { kind: "number", number: 1 }, reason);
    expect(() => make(session, page, 0)).toThrow("recorded_target_unavailable");
    expect(() => make(session, page, 107, " ")).toThrow();
    expect(() => make(session, { ...page, samples: [{ index: 107, values: [{ ...page.samples[0].values[0], present: false }] }] })).toThrow();
    expect(() => make({ ...session, opened: { ...session.opened, session: { ...session.opened.session, channels: [{ ...session.opened.session.channels[0], unit: { quality: "unknown" } }] } } })).toThrow();
    expect(() => recordedSampleCorrection(session, page, 107, "value", { kind: "number", number: NaN }, "reviewed")).toThrow();
  });
  it("replaces only the exact target and rejects foreign bases and overflow", () => {
    const { correction } = fixture();
    const first = correction();
    const other = { ...first, target: { ...first.target, sampleIndex: 108 } };
    const changed = { ...first, replacement: { kind: "number" as const, number: 4 } };
    const result = replaceRecordedCorrection([first, other], changed);
    expect(result).toEqual([other, changed]);
    expect(first.replacement.number).toBe(0);
    expect(() => replaceRecordedCorrection([{ ...other, base: { ...base, sessionId: "foreign" } }], changed)).toThrow("recorded_correction_base_mismatch");
    const full = Array.from({ length: 256 }, (_, sampleIndex) => ({ ...first, target: { ...first.target, sampleIndex } }));
    expect(() => replaceRecordedCorrection(full, { ...first, target: { ...first.target, sampleIndex: 999 } })).toThrow("recorded_correction_limit");
  });
  it("captures a stable whole-snapshot request and refuses historical-head overwrite", () => {
    const { session, loaded, correction } = fixture();
    const active = [correction()];
    const request = recordedCorrectionSave(session, loaded, active, "Correction review", "stable-command");
    active.length = 0;
    expect(request.corrections).toHaveLength(1);
    expect(request.command).toMatchObject({ commandId: "stable-command", expectedRevision: initial });
    expect(request.sessionId).toBe("handle");
    expect(() => recordedCorrectionSave(session, { ...loaded, headId: next }, [], "Restore", "restore")).toThrow("recorded_revision_conflict");
    expect(() => recordedCorrectionSave(session, loaded, [correction(), correction()], "Duplicated", "duplicate")).toThrow("recorded_overlapping_corrections");
    const current = { ...loaded, headId: next, revision: { ...loaded.revision, revisionId: next } };
    const restore = recordedCorrectionSave(session, current, [], "Restore original values", "restore");
    expect(restore.corrections).toEqual([]);
    expect(restore.command.expectedRevision).toBe(next);
  });
});

describe("exact recorded revisions", () => {
  it("reads a pinned revision even when the head advanced, without adopting the head", async () => {
    const { session, loaded } = fixture();
    const load = vi.fn().mockResolvedValue({ ...loaded, headId: next });
    const client = { load } as unknown as AnalysisClient;
    expect((await loadRecordedCorrection(client, session)).headId).toBe(next);
    expect(load).toHaveBeenCalledWith({ sessionId: "handle", base, revisionId: initial }, undefined);
    expect(session.revision.revisionId).toBe(initial);
    await expect(loadRecordedCorrection(client, session, "")).rejects.toThrow("recorded_exact_revision_required");
    load.mockResolvedValue({ ...loaded, revision: { ...loaded.revision, snapshot: { ...loaded.revision.snapshot, snapshotId: next } } });
    await expect(loadRecordedCorrection(client, session)).rejects.toThrow("recorded_revision_mismatch");
  });
  it("projects the saved exact snapshot without saving or adopting it implicitly", async () => {
    const { session, loaded } = fixture();
    const saved = { ...loaded, headId: next, revision: { ...loaded.revision, revisionId: next, snapshot: { ...loaded.revision.snapshot, snapshotId: next } } };
    const project = vi.fn().mockRejectedValueOnce(new Error("reader unavailable"));
    const save = vi.fn();
    const client = { project, save } as unknown as AnalysisClient;
    await expect(projectRecordedCorrection(client, session, saved)).rejects.toThrow("reader unavailable");
    const ref = { ...session.revision, revisionId: next, snapshotId: next };
    project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [ref] });
    expect((await projectRecordedCorrection(client, session, saved)).revision).toEqual(ref);
    expect(save).not.toHaveBeenCalled();
    expect(session.revision.revisionId).toBe(initial);
    project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...ref, baseDigest: "f".repeat(64) }] });
    await expect(projectRecordedCorrection(client, session, saved)).rejects.toThrow("recorded_revision_mismatch");
  });
});

function familyFixture() {
  const f = fixture();
  const target = { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" };
  const family = "combined_stint_pace_curve" as const;
  const use = { family, included: true, exclusionReasons: null };
  const original = { ...target, complete: true, labels: [], familyUse: [use] };
  const page: AnalysisLapPage = { revisionId: initial, headId: next, page: { base, snapshotId: initial, start: 0, total: 1, laps: [{ original, effective: structuredClone(original), target, capabilities: [{ family, automaticIncluded: true, effectiveIncluded: true, canInclude: true, canExclude: true }] }] } };
  const correction: AnalysisFamilyCorrection = { base, target, family, expected: use, included: false, reason: "Reviewed pace only" };
  return { ...f, target, family, lapPage: page, familyCorrection: correction };
}
describe("recorded family correction helpers", () => {
  it("reads a fixed page without adopting its head and rejects another snapshot", async () => {
    const f = familyFixture(), laps = vi.fn().mockResolvedValue(f.lapPage), client = { laps } as unknown as AnalysisClient;
    expect(await loadRecordedLapPage(client, f.session, f.loaded)).toBe(f.lapPage);
    expect(laps).toHaveBeenCalledExactlyOnceWith({ sessionId: "handle", base, revisionId: initial, start: 0, limit: 25 }, undefined);
    expect(f.session.revision.revisionId).toBe(initial);
    laps.mockResolvedValue({ ...f.lapPage, page: { ...f.lapPage.page, snapshotId: next } });
    await expect(loadRecordedLapPage(client, f.session, f.loaded)).rejects.toThrow("recorded_revision_mismatch");
  });
  it("uses only a unique original target and its native capability", () => {
    const f = familyFixture();
    const result = recordedFamilyCorrection(f.session, f.loaded, f.lapPage, f.target, f.family, false, "Reviewed");
    expect(result.expected).toEqual(f.familyCorrection.expected);
    expect(result.expected).not.toBe(f.familyCorrection.expected);
    expect(() => recordedFamilyCorrection(f.session, f.loaded, f.lapPage, { ...f.target, end: "2026-09-10T12:01:31Z" }, f.family, false, "Reviewed")).toThrow("recorded_target_unavailable");
    const blocked = { ...f.lapPage, page: { ...f.lapPage.page, laps: [{ ...f.lapPage.page.laps[0], capabilities: [{ ...f.lapPage.page.laps[0].capabilities[0], canInclude: false }] }] } };
    expect(() => recordedFamilyCorrection(f.session, f.loaded, blocked, f.target, f.family, true, "Reviewed")).toThrow("recorded_family_read_only");
    expect(() => recordedFamilyCorrection(f.session, f.loaded, { ...f.lapPage, revisionId: next }, f.target, f.family, false, "Reviewed")).toThrow("recorded_revision_mismatch");
    expect(() => recordedFamilyCorrection(f.session, f.loaded, f.lapPage, f.target, f.family, false, "")).toThrow();
  });
  it("replaces/removes one family and preserves independent choices", () => {
    const { familyCorrection: first } = familyFixture();
    const fuel: AnalysisFamilyCorrection = { ...first, family: "fuel_consumption", expected: { ...first.expected, family: "fuel_consumption" } };
    const changed = { ...first, included: true, reason: "Explicit inclusion" };
    expect(replaceRecordedFamilyCorrection([first, fuel], changed)).toEqual([fuel, changed]);
    const sameInstant = { ...first.target, start: "2026-09-10T14:00:00+02:00", end: "2026-09-10T14:01:30+02:00" };
    expect(removeRecordedFamilyCorrection([first, fuel], sameInstant, first.family)).toEqual([fuel]);
  });
  it("saves a whole mixed set, preserves families on scalar edit and restores explicitly", () => {
    const f = familyFixture();
    const current: AnalysisStoreResult = { ...f.loaded, revision: { ...f.loaded.revision, snapshot: { ...f.loaded.revision.snapshot, contractVersion: "analysis.observation-snapshot.v2", familyUses: [{ baseId: digest, correctionId: next, request: f.familyCorrection, original: f.familyCorrection.expected, corrected: { ...f.familyCorrection.expected, included: false, exclusionReasons: ["manual_exclusion"] } }] } } };
    const saved = recordedCorrectionSave(f.session, current, [f.correction()], "Review", "stable");
    expect(saved.familyUses).toEqual([f.familyCorrection]);
    expect(saved.familyUses?.[0]).not.toBe(f.familyCorrection);
    const restore = recordedCorrectionSave(f.session, current, [], "Restore all", "restore", []);
    expect(restore.familyUses).toEqual([]);
    const full = Array.from({ length: 256 }, (_, sampleIndex) => ({ ...f.correction(), target: { ...f.correction().target, sampleIndex } }));
    expect(() => recordedCorrectionSave(f.session, current, full, "Over budget", "over")).toThrow("recorded_correction_limit");
  });
});
