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
