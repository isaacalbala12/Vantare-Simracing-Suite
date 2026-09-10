import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import type { AnalysisClassificationCorrection, AnalysisFamilyCorrection, AnalysisLapPage, AnalysisBase, AnalysisMetadata, AnalysisPage, AnalysisScalar, AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { loadRecordedLapPage, recordedClassificationCorrection, recordedClassificationOriginal, recordedFamilyCorrection, removeRecordedClassificationCorrection, replaceRecordedClassificationCorrection, replaceRecordedFamilyCorrection, removeRecordedFamilyCorrection, loadRecordedCorrection, projectRecordedCorrection, recordedCorrectionSave, recordedSampleCorrection, replaceRecordedCorrection } from "./strategy-recorded-corrections";

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

describe("recorded classification preservation", () => {
  it("keeps the loaded classification set when saving with the previous signature", () => {
    const { session: plain } = fixture();
    const session = { ...plain, opened: { ...plain.opened, session: { ...plain.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    const decision: AnalysisClassificationCorrection = { base, field: "SessionType", expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" };
    const command = { expectedRevision: initial, commandId: "classify", reason: "Reviewed", localAuthorId: "local" };
    const current: AnalysisStoreResult = { headId: next, revision: { revisionId: next, parentRevisionId: initial, command, commandDigest: digest, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base, snapshotId: next, corrections: [], familyUses: [], classifications: [{ baseId: initial, correctionId: digest, request: decision, original: "practice", corrected: "race" }] } } };
    expect(parseCorrectionStoreResult(current)).toBe(current);
    const saved = recordedCorrectionSave(session, current, [], "Review", "stable");
    expect(saved.classifications).toEqual([decision]);
    expect(saved.classifications?.[0]).not.toBe(decision);
  });
});

function classificationFixture() {
  const f = fixture();
  const metadata = [
    { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" },
    { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" },
  ];
  const session: RecordedSession = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata } } };
  return { ...f, session };
}

describe("recorded classification decisions", () => {
  it("builds each field from the open original while other metadata stays absent", () => {
    const f = classificationFixture();
    expect(recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin")).toEqual({ base, field: "SessionType", expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" });
    expect(recordedClassificationCorrection(f.session, f.loaded, "WeatherConditions", "Overcast", "Metar check")).toMatchObject({ field: "WeatherConditions", expectedOriginal: "Dry", replacement: "Overcast" });
    const lone = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationCorrection(lone, f.loaded, "SessionType", "race", "Stewards bulletin").expectedOriginal).toBe("practice");
  });
  it("rejects missing, unusable or ambiguous originals without blocking valid fields", () => {
    const f = classificationFixture();
    expect(() => recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "ok")).not.toThrow();
    const patch = (entry: AnalysisMetadata) => ({ ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [entry] } } });
    expect(() => recordedClassificationCorrection(patch({ key: "TrackName", present: true, quality: "valid", sensitive: false, value: "Imola" }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_target_unavailable");
    expect(() => recordedClassificationCorrection(patch({ key: "SessionType", present: true, quality: "stale", sensitive: false, value: "practice" }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationCorrection(patch({ key: "SessionType", present: true, quality: "valid", sensitive: true, value: "practice" }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationCorrection(patch({ key: "SessionType", present: true, quality: "valid", sensitive: false, redacted: true, value: "practice" }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationCorrection(patch({ key: "SessionType", present: true, quality: "valid", sensitive: false }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationCorrection({ ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "sessiontype", present: true, quality: "valid" as const, sensitive: false, value: "practice" }, { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } }, f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_ambiguous");
    const foreign = { ...f.loaded, revision: { ...f.loaded.revision, snapshot: { ...f.loaded.revision.snapshot, base: { ...base, sessionId: "foreign" } } } };
    expect(() => recordedClassificationCorrection(f.session, foreign, "SessionType", "race", "ok")).toThrow("recorded_correction_base_mismatch");
    expect(() => recordedClassificationCorrection(f.session, f.loaded, "CarName" as unknown as "SessionType", "race", "ok")).toThrow("recorded_classification_invalid");
    expect(() => recordedClassificationCorrection(f.session, f.loaded, "SessionType", "sprint", "ok")).toThrow();
    expect(() => recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "  ")).toThrow();
  });
  it("keeps raw originals and resolves Unicode metadata keys", () => {
    const f = classificationFixture();
    const spaced = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "race " }] } } };
    const raw = recordedClassificationCorrection(spaced, f.loaded, "SessionType", " qualify ", "Stewards bulletin");
    expect(raw.expectedOriginal).toBe("race ");
    expect(raw.replacement).toBe(" qualify ");
    const turkish = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: " SESSİONTYPE ", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationCorrection(turkish, f.loaded, "SessionType", "race", "ok").expectedOriginal).toBe("practice");
    const nel = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "sessiontype", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationCorrection(nel, f.loaded, "SessionType", "race", "ok").expectedOriginal).toBe("practice");
    const feff = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "﻿SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(() => recordedClassificationCorrection(feff, f.loaded, "SessionType", "race", "ok")).toThrow("recorded_target_unavailable");
  });
  it("replaces and removes one field while preserving the rest", () => {
    const f = classificationFixture();
    const first = recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin");
    const second = recordedClassificationCorrection(f.session, f.loaded, "WeatherConditions", "Overcast", "Metar check");
    const active = [first, second];
    const changed: AnalysisClassificationCorrection = { ...first, replacement: "qualify", reason: "Amended" };
    const replaced = replaceRecordedClassificationCorrection(active, changed);
    expect(replaced).toEqual([second, changed]);
    expect(replaced[1]).not.toBe(changed);
    expect(active).toEqual([first, second]);
    expect(replaceRecordedClassificationCorrection([], changed)).toEqual([changed]);
    expect(removeRecordedClassificationCorrection(active, "SessionType")).toEqual([second]);
    const kept = removeRecordedClassificationCorrection(active, "WeatherConditions");
    expect(kept).toEqual([first]);
    expect(kept).not.toBe(active);
    expect(removeRecordedClassificationCorrection([], "SessionType")).toEqual([]);
    expect(() => removeRecordedClassificationCorrection(active, "CarName" as unknown as "SessionType")).toThrow("recorded_classification_invalid");
    expect(() => replaceRecordedClassificationCorrection(active, { ...changed, base: { ...base, sessionId: "foreign" } })).toThrow();
    const foreignActive: AnalysisClassificationCorrection = { ...first, base: { ...base, sessionId: "foreign" } };
    expect(() => replaceRecordedClassificationCorrection([foreignActive, second], first)).toThrow();
    expect(() => replaceRecordedClassificationCorrection([first, first], changed)).toThrow();
    expect(() => removeRecordedClassificationCorrection([foreignActive, second], "WeatherConditions")).toThrow();
    const oversized = Array.from({ length: 257 }, () => structuredClone(first));
    expect(() => replaceRecordedClassificationCorrection(oversized, changed)).toThrow("limit");
  });
  it("saves explicit classification sets and withdraws them explicitly", () => {
    const f = classificationFixture();
    const decision = recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin");
    const saved = recordedCorrectionSave(f.session, f.loaded, [], "Review", "explicit", [], [decision]);
    expect(saved.classifications).toEqual([decision]);
    expect(saved.classifications?.[0]).not.toBe(decision);
    const retired = recordedCorrectionSave(f.session, f.loaded, [], "Withdraw", "withdraw", [], []);
    expect(retired.classifications).toEqual([]);
    expect("classifications" in retired).toBe(true);
  });
  it("holds 256 decisions across the three groups and rejects 257 before traversing", () => {
    const f = classificationFixture();
    const family = familyFixture().familyCorrection;
    const decision = recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin");
    const full = Array.from({ length: 254 }, (_, sampleIndex) => ({ ...f.correction(), target: { ...f.correction().target, sampleIndex } }));
    const atLimit = recordedCorrectionSave(f.session, f.loaded, full, "Review", "full", [family], [decision]);
    expect(atLimit.corrections).toHaveLength(254);
    expect(atLimit.familyUses).toHaveLength(1);
    expect(atLimit.classifications).toHaveLength(1);
    expect(atLimit.classifications?.[0]).not.toBe(decision);
    const over = Array.from({ length: 256 }, (_, sampleIndex) => ({ ...f.correction(), target: { ...f.correction().target, sampleIndex } }));
    expect(() => recordedCorrectionSave(f.session, f.loaded, over, "Over", "over", [], [decision])).toThrow("recorded_correction_limit");
    let touched = false;
    const poisoned: unknown[] = [decision];
    Object.defineProperty(poisoned, "0", { get() { touched = true; throw new Error("getter.accessed"); }, enumerable: true, configurable: true });
    expect(() => recordedCorrectionSave(f.session, f.loaded, over, "Over", "over", [], poisoned as unknown as AnalysisClassificationCorrection[])).toThrow("recorded_correction_limit");
    expect(touched).toBe(false);
  });
  it("never aliases inputs and rejects mixed classification bases", () => {
    const f = classificationFixture();
    const decision = recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin");
    const families = [familyFixture().familyCorrection];
    const saved = recordedCorrectionSave(f.session, f.loaded, [], "Review", "stable", families, [decision]);
    (decision as unknown as { reason: string }).reason = "mutated after save";
    (families[0] as unknown as { reason: string }).reason = "mutated after save";
    expect(saved.classifications?.[0]?.reason).toBe("Stewards bulletin");
    expect(saved.familyUses?.[0]?.reason).toBe("Reviewed pace only");
    expect(saved.classifications?.[0]).not.toBe(decision);
    expect(() => recordedCorrectionSave(f.session, f.loaded, [], "Review", "stable", [], [{ ...decision, base: { ...base, sessionId: "foreign" } }])).toThrow();
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

describe("recorded classification original query", () => {
  it("returns the opened original and matches the builder expectedOriginal", () => {
    const f = classificationFixture();
    expect(recordedClassificationOriginal(f.session, f.loaded, "SessionType")).toBe("practice");
    expect(recordedClassificationOriginal(f.session, f.loaded, "WeatherConditions")).toBe("Dry");
    const built = recordedClassificationCorrection(f.session, f.loaded, "SessionType", "race", "Stewards bulletin");
    expect(built.expectedOriginal).toBe(recordedClassificationOriginal(f.session, f.loaded, "SessionType"));
  });
  it("reads the opened original even when the saved effective value differs", () => {
    const f = classificationFixture();
    const decision: AnalysisClassificationCorrection = { base, field: "SessionType", expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" };
    const command = { expectedRevision: initial, commandId: "classify", reason: "Reviewed", localAuthorId: "local" };
    const current: AnalysisStoreResult = { headId: next, revision: { revisionId: next, parentRevisionId: initial, command, commandDigest: digest, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base, snapshotId: next, corrections: [], familyUses: [], classifications: [{ baseId: initial, correctionId: digest, request: decision, original: "practice", corrected: "race" }] } } };
    expect(parseCorrectionStoreResult(current)).toBe(current);
    expect(recordedClassificationOriginal(f.session, current, "SessionType")).toBe("practice");
  });
  it("returns raw originals and resolves Unicode keys like the builder", () => {
    const f = classificationFixture();
    const spaced = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "race " }] } } };
    expect(recordedClassificationOriginal(spaced, f.loaded, "SessionType")).toBe("race ");
    expect(recordedClassificationCorrection(spaced, f.loaded, "SessionType", " qualify ", "Stewards bulletin").expectedOriginal).toBe("race ");
    const turkish = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: " SESS" + String.fromCharCode(0x130) + "ONTYPE ", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationOriginal(turkish, f.loaded, "SessionType")).toBe("practice");
    const nel = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: String.fromCharCode(0x85) + "sessiontype" + String.fromCharCode(0x85), present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationOriginal(nel, f.loaded, "SessionType")).toBe("practice");
    const feff = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: String.fromCharCode(0xFEFF) + "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(() => recordedClassificationOriginal(feff, f.loaded, "SessionType")).toThrow("recorded_target_unavailable");
  });
  it("rejects unknown, absent, duplicated, sensitive, redacted and stale originals", () => {
    const f = classificationFixture();
    const patch = (entry: AnalysisMetadata) => ({ ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [entry] } } });
    expect(() => recordedClassificationOriginal(patch({ key: "TrackName", present: true, quality: "valid", sensitive: false, value: "Imola" }), f.loaded, "SessionType")).toThrow("recorded_target_unavailable");
    expect(() => recordedClassificationOriginal(patch({ key: "SessionType", present: true, quality: "stale", sensitive: false, value: "practice" }), f.loaded, "SessionType")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationOriginal(patch({ key: "SessionType", present: true, quality: "valid", sensitive: true, value: "practice" }), f.loaded, "SessionType")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationOriginal(patch({ key: "SessionType", present: true, quality: "valid", sensitive: false, redacted: true, value: "practice" }), f.loaded, "SessionType")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationOriginal(patch({ key: "SessionType", present: true, quality: "valid", sensitive: false }), f.loaded, "SessionType")).toThrow("recorded_classification_read_only");
    expect(() => recordedClassificationOriginal({ ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "sessiontype", present: true, quality: "valid" as const, sensitive: false, value: "practice" }, { key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } }, f.loaded, "SessionType")).toThrow("recorded_classification_ambiguous");
    expect(() => recordedClassificationCorrection(patch({ key: "SessionType", present: true, quality: "stale", sensitive: false, value: "practice" }), f.loaded, "SessionType", "race", "ok")).toThrow("recorded_classification_read_only");
    const foreign = { ...f.loaded, revision: { ...f.loaded.revision, snapshot: { ...f.loaded.revision.snapshot, base: { ...base, sessionId: "foreign" } } } };
    expect(() => recordedClassificationOriginal(f.session, foreign, "SessionType")).toThrow("recorded_correction_base_mismatch");
    expect(() => recordedClassificationOriginal(f.session, f.loaded, "CarName" as unknown as "SessionType")).toThrow("recorded_classification_invalid");
  });
  it("accepts long originals without a new cap, rejects unknown enums and never mutates inputs", () => {
    const f = classificationFixture();
    const long = "w".repeat(5000);
    const weathered = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: long }] } } };
    expect(recordedClassificationOriginal(weathered, f.loaded, "WeatherConditions")).toBe(long);
    expect(recordedClassificationCorrection(weathered, f.loaded, "WeatherConditions", "Dry", "Metar check").expectedOriginal).toBe(long);
    const unknownEnum = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "banana" }] } } };
    expect(() => recordedClassificationOriginal(unknownEnum, f.loaded, "SessionType")).toThrow("classification.sessionType");
    expect(() => recordedClassificationCorrection(unknownEnum, f.loaded, "SessionType", "race", "ok")).toThrow("classification.sessionType");
    const before = structuredClone([f.session, f.loaded]);
    recordedClassificationOriginal(f.session, f.loaded, "SessionType");
    expect([f.session, f.loaded]).toEqual(before);
  });
  it("leaves other missing metadata blocking nothing", () => {
    const f = classificationFixture();
    const lone = { ...f.session, opened: { ...f.session.opened, session: { ...f.session.opened.session, metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }] } } };
    expect(recordedClassificationOriginal(lone, f.loaded, "SessionType")).toBe("practice");
    expect(() => recordedClassificationOriginal(lone, f.loaded, "WeatherConditions")).toThrow("recorded_target_unavailable");
  });
});
