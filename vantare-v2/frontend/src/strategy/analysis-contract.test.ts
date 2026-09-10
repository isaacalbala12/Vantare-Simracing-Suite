import { analysisLapInstant, parseAnalysisFamilyCorrections, parseAnalysisLapTarget, sameAnalysisFamilyCorrections } from "./analysis-contract";
import { describe, expect, it } from "vitest";
import { analysisValue, parseAnalysisCandidates, parseAnalysisCommandResolution, parseAnalysisPreparation, parseCorrectionStoreResult, parseHistoricalValue } from "./analysis-contract";
describe("local discovery labels", () => {
  const candidate = { id: "opaque", state: "ready", size: 10, modifiedAt: "2026-09-10T00:00:00Z", walPresent: false };
  it("accepts optional sanitized names without deriving identity", () => {
    expect(parseAnalysisCandidates([candidate])).toEqual([candidate]);
    expect(parseAnalysisCandidates([{ ...candidate, displayName: "São_Paulo.duckdb" }])[0]).toMatchObject({ id: "opaque", displayName: "São_Paulo.duckdb" });
  });
  it.each([null, 1, "", "a/b.duckdb", "C:\\a.duckdb", "a\nb", "a\u202eb", "界".repeat(400)])("rejects unsafe local label %j", displayName => {
    expect(() => parseAnalysisCandidates([{ ...candidate, displayName }])).toThrow();
  });
});
const base = { sessionId: "session", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: "b".repeat(64) };
const snapshotId = "c".repeat(64);
describe("prepared editable channels", () => {
  it("requires explicit capability and preserves an empty supported set", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId })).not.toHaveProperty("editableChannelIds");
    for (const editableChannelIds of [[], ["lap", "fuel"]]) {
      expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, editableChannelIds })).toMatchObject({ editableChannelIds });
    }
  });
  it.each([null, "lap", [""], [1], ["lap", "lap"], ["界".repeat(100)]].map(editableChannelIds => ({ editableChannelIds })))("rejects malformed capability $editableChannelIds", ({ editableChannelIds }) => {
    expect(() => parseAnalysisPreparation({ base, baseRevisionId: snapshotId, editableChannelIds })).toThrow();
  });
});
const combination = { id: `lmu:${"d".repeat(64)}`, simId: "lmu", trackName: "Imola", trackLayout: "Grand Prix", carName: "Car", carClass: "Hypercar" };
describe("prepared combination identity", () => {
  it("preserves the canonical identity without requiring a preexisting catalog", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, combination })).toMatchObject({ combination });
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId })).not.toHaveProperty("combination");
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, combinationUnavailableReason: "metadata_unavailable" })).toMatchObject({ combinationUnavailableReason: "metadata_unavailable" });
  });
  it.each([
    { combination: null }, { combination: {} }, { combination: { ...combination, simId: "" } },
    { combination: { ...combination, trackName: 12 } }, { combination: { ...combination, carName: undefined } },
    { combination, combinationUnavailableReason: "metadata_unavailable" },
    { combinationUnavailableReason: "guessed" }, { combinationUnavailableReason: null },
  ])("rejects malformed or contradictory metadata: %j", fields => {
    expect(() => parseAnalysisPreparation({ base, baseRevisionId: snapshotId, ...fields })).toThrow();
  });
});
const baseResult = () => ({ headId: snapshotId, revision: { revisionId: snapshotId, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId, corrections: [] } } });
describe("uncertain command resolution", () => {
  it("distinguishes confirmed absence from an actual revision", () => {
    expect(parseAnalysisCommandResolution({ found: false, headId: snapshotId })).toEqual({ found: false, headId: snapshotId });
    const saved = baseResult();
    saved.revision.parentRevisionId = "d".repeat(64);
    saved.revision.command = { expectedRevision: saved.revision.parentRevisionId, commandId: "saved", reason: "Reviewed", localAuthorId: "local" };
    saved.revision.createdAt = "2026-09-10T00:00:00Z";
    saved.revision.commandDigest = "e".repeat(64);
    expect(parseAnalysisCommandResolution({ found: true, ...saved }).found).toBe(true);
  });
  it.each([null, { found: false }, { found: "false", headId: snapshotId }, { found: false, ...baseResult() }, { found: true, headId: snapshotId }, { found: true, ...baseResult() }])("rejects ambiguous resolution %j", value => {
    expect(() => parseAnalysisCommandResolution(value)).toThrow();
  });
});
describe("Analysis correction wire contract", () => {
  it.each([
    [{ column: "v", present: true, quality: "unknown", scalar: { kind: "number" } }, 0],
    [{ column: "v", present: true, quality: "valid", scalar: { kind: "boolean" } }, false],
    [{ column: "v", present: false, quality: "missing", scalar: { kind: "number" } }, null],
    [{ column: "v", present: true, quality: "invalid", scalar: { kind: "number", number: 12 } }, 12],
  ])("preserves typed zero, false, absence and original quality", (wire, expected) => {
    const value = parseHistoricalValue(wire);
    expect(analysisValue(value)).toBe(expected);
    expect(value.quality).toBe(wire.quality);
  });
  it.each([{ kind: "integer", integer: Number.MAX_SAFE_INTEGER + 1 }, { kind: "number", number: NaN }, { kind: "number", number: null }, { kind: "boolean", integer: 1 }])("rejects ambiguous or unsafe scalars", (scalar) => {
    expect(() => parseHistoricalValue({ column: "v", present: true, quality: "valid", scalar })).toThrow();
  });
  it("accepts an explicit base revision and rejects fabricated metadata", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId }).base).toEqual(base);
    expect(parseCorrectionStoreResult(baseResult()).revision.snapshot.corrections).toEqual([]);
    const altered = baseResult();
    altered.revision.command.reason = "pretend saved";
    expect(() => parseCorrectionStoreResult(altered)).toThrow();
    expect(() => parseAnalysisPreparation({ base: { ...base, contentSha256: "A".repeat(64) }, baseRevisionId: snapshotId })).toThrow();
  });
  it("preserves a saved correction and rejects a quality promotion or foreign base", () => {
    const original = { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } };
    const replacement = { kind: "number", number: 0 };
    const correction = { baseId: "d".repeat(64), correctionId: "e".repeat(64), request: { base, target: { channelId: "fuel", column: "v", sampleIndex: 4 }, unit: { symbol: "L", quality: "valid" }, expected: original, replacement, reason: "test" }, original, corrected: { ...original, scalar: replacement } };
    const result = { headId: "f".repeat(64), revision: { revisionId: "f".repeat(64), parentRevisionId: snapshotId, command: { expectedRevision: snapshotId, commandId: "save", reason: "test", localAuthorId: "local" }, commandDigest: "d".repeat(64), createdAt: "2026-09-08T12:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: "e".repeat(64), corrections: [correction] } } };
    expect(parseCorrectionStoreResult(result).revision.snapshot.corrections[0].corrected.quality).toBe("unknown");
    correction.corrected.quality = "valid";
    expect(() => parseCorrectionStoreResult(result)).toThrow();
    correction.corrected.quality = "unknown";
    correction.request.base = { ...base, sessionId: "foreign" };
    expect(() => parseCorrectionStoreResult(result)).toThrow();
  });
});

function mixedFamilyResult() {
  const request = { base, target: { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" }, family: "combined_stint_pace_curve" as const, expected: { family: "combined_stint_pace_curve", included: true, exclusionReasons: null }, included: false, reason: "Reviewed pace only" };
  const prepared = { baseId: "b".repeat(64), correctionId: "c".repeat(64), request, original: request.expected, corrected: { family: request.family, included: false, exclusionReasons: ["manual_exclusion"] } };
  const parent = "d".repeat(64);
  return { headId: snapshotId, revision: { revisionId: snapshotId, parentRevisionId: parent, command: { expectedRevision: parent, commandId: "mixed", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "e".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.observation-snapshot.v2", base, snapshotId, corrections: [], familyUses: [prepared] } } };
}
describe("mixed family correction contract", () => {
  it("retains complete mixed snapshots and scalar legacy", () => {
    const result = mixedFamilyResult();
    expect(parseCorrectionStoreResult(result)).toBe(result);
    expect(parseCorrectionStoreResult(baseResult()).revision.snapshot.familyUses).toBeUndefined();
  });
  it.each(["wrong version", "missing families", "changed original", "changed corrected", "overlap", "wrong base", "pretended original correction", "mixed base revision"])("rejects %s", mode => {
    const value = mixedFamilyResult();
    const snapshot = value.revision.snapshot;
    if (mode === "wrong version") snapshot.contractVersion = "analysis.sample-snapshot.v1";
    if (mode === "missing families") snapshot.familyUses = [];
    if (mode === "changed original") snapshot.familyUses[0].original = { ...snapshot.familyUses[0].original, included: false };
    if (mode === "changed corrected") snapshot.familyUses[0].corrected.included = true;
    if (mode === "overlap") snapshot.familyUses.push(structuredClone(snapshot.familyUses[0]));
    if (mode === "wrong base") snapshot.familyUses[0].request.base = { ...base, sessionId: "other" };
    if (mode === "pretended original correction") Object.assign(snapshot.familyUses[0].request.expected, { correctionId: "f".repeat(64) });
    if (mode === "mixed base revision") { value.revision.createdAt = ""; value.revision.parentRevisionId = ""; value.revision.commandDigest = ""; value.revision.command = { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }; }
    expect(() => parseCorrectionStoreResult(value)).toThrow();
  });
  it("preserves nanosecond ordering and canonical instant identity", () => {
    const item = mixedFamilyResult().revision.snapshot.familyUses[0].request;
    const first = { ...item, target: { number: 2, start: "2026-09-10T12:00:00.000000001Z", end: "2026-09-10T12:00:00.000000002Z" } };
    const adjacent = { ...item, target: { number: 3, start: first.target.end, end: "2026-09-10T12:00:00.000000003Z" } };
    expect(parseAnalysisFamilyCorrections([first, adjacent], base)).toEqual([first, adjacent]);
    expect(analysisLapInstant(adjacent.target.end) - analysisLapInstant(first.target.start)).toBe(2n);
    const local = { ...first, target: { ...first.target, start: "2026-09-10T14:00:00.000000001+02:00", end: "2026-09-10T14:00:00.000000002+02:00" } };
    expect(sameAnalysisFamilyCorrections([first], [local])).toBe(true);
    expect(() => parseAnalysisFamilyCorrections([first, local], base)).toThrow("overlap");
    expect(() => parseAnalysisLapTarget({ ...first.target, end: first.target.start })).toThrow();
    expect(() => analysisLapInstant("2026-02-30T00:00:00Z")).toThrow();
    expect(() => analysisLapInstant("2026-09-10T12:00:00.1234567891Z")).toThrow();
  });
});
