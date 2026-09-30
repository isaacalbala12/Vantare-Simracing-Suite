import { describe, expect, it } from "vitest";
import { parseAnalysisPreparation, parseAnalysisStintBoundaryCorrections, parseCorrectionStoreResult } from "./analysis-contract";

const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
const base = { sessionId: "race", contentSha256: a, sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
const provenance = { kind: "observed", sourceId: "race" };
const confidence = { sampleSize: 1, computationVersion: "lap-validity.v1" };
const original = { stintNumber: 2, timestamp: "2026-09-09T10:01:30Z", cause: "pit", presence: "valid", provenance, confidence };
const request = { operation: "set_stint_boundary", base, target: { stintNumber: 2, timestamp: original.timestamp, cause: "pit" }, expected: original, replacement: { anchor: { lapNumber: 4, timestamp: "2026-09-09T10:06:00Z" }, cause: "driver_change" }, reason: "Reviewed" };

describe("Analysis stint correction contract", () => {
  it("parses native options and a closed correction set", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: a, stintBoundaries: [original], stintAnchors: [request.replacement.anchor] }).stintAnchors).toHaveLength(1);
    expect(parseAnalysisStintBoundaryCorrections([request], base)).toEqual([request]);
    const inventory = Array.from({ length: 257 }, (_, index) => ({ ...original, stintNumber: index + 1, timestamp: new Date(index * 1000).toISOString() }));
    expect(parseAnalysisPreparation({ base, baseRevisionId: a, stintBoundaries: inventory, stintAnchors: [] }).stintBoundaries).toHaveLength(257);
  });

  it("accepts v5 while legacy snapshots cannot carry stints", () => {
    const prepared = { baseId: c, correctionId: b, request, original };
    const revision = { revisionId: a, parentRevisionId: b, command: { expectedRevision: b, commandId: "stint", reason: "Reviewed", localAuthorId: "local-user" }, commandDigest: c, createdAt: "2026-09-09T10:10:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v5", base, snapshotId: a, corrections: [], familyUses: [], classifications: [], stintBoundaries: [prepared] } };
    expect(parseCorrectionStoreResult({ headId: a, revision }).revision.snapshot.stintBoundaries).toHaveLength(1);
    expect(() => parseCorrectionStoreResult({ headId: a, revision: { ...revision, snapshot: { ...revision.snapshot, contractVersion: "analysis.sample-snapshot.v1" } } })).toThrow();
    expect(() => parseCorrectionStoreResult({ headId: a, revision: { ...revision, snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: a, corrections: [], stintBoundaries: [] } } })).toThrow();
  });
});
