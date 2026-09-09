import { describe, expect, it } from "vitest";
import { analysisValue, parseAnalysisPreparation, parseCorrectionStoreResult, parseHistoricalValue } from "./analysis-contract";
const base = { sessionId: "session", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: "b".repeat(64) };
const snapshotId = "c".repeat(64);
const baseResult = () => ({ headId: snapshotId, revision: { revisionId: snapshotId, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId, corrections: [] } } });
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
