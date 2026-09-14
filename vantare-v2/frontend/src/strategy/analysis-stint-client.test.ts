import { describe, expect, it, vi } from "vitest";
import { createAnalysisClient, type AnalysisSaveRequest, type AnalysisTransport } from "./analysis-client";

const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
const base = { sessionId: "race", contentSha256: a, sizeBytes: 1, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
const original = { stintNumber: 2, timestamp: "2026-09-09T10:01:30Z", cause: "pit" as const, presence: "valid" as const, provenance: { kind: "observed", sourceId: "race" }, confidence: { sampleSize: 1, computationVersion: "lap-validity.v1" } };
const correction = { operation: "remove_stint_boundary" as const, base, target: { stintNumber: 2, timestamp: original.timestamp, cause: original.cause }, expected: original, reason: "False split" };
const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], classifications: [], stintBoundaries: [correction], command: { expectedRevision: b, commandId: "stint", reason: "Reviewed", localAuthorId: "local-user" } };
function response(includeStints = true) {
  return { headId: a, revision: { revisionId: a, parentRevisionId: b, command: request.command, commandDigest: c, createdAt: "2026-09-09T10:10:00Z", snapshot: { contractVersion: includeStints ? "analysis.mixed-snapshot.v5" : "analysis.sample-snapshot.v1", base, snapshotId: a, corrections: [], familyUses: [], classifications: [], ...(includeStints ? { stintBoundaries: [{ baseId: c, correctionId: b, request: correction, original }] } : {}) } } };
}

describe("Analysis stint client", () => {
  it("saves through the existing method and verifies the complete returned set", async () => {
    const transport = { call: vi.fn().mockResolvedValue(response()) } as AnalysisTransport;
    await expect(createAnalysisClient(transport).save(request)).resolves.toMatchObject({ headId: a });
    expect(transport.call).toHaveBeenCalledWith("SaveCorrections", [request], undefined);
  });
  it("rejects a response that loses the set and a null request group", async () => {
    const client = createAnalysisClient({ call: vi.fn().mockResolvedValue(response(false)) } as AnalysisTransport);
    await expect(client.save(request)).rejects.toThrow("save.requestMismatch");
    await expect(client.save({ ...request, stintBoundaries: null } as unknown as AnalysisSaveRequest)).rejects.toThrow("request.stintBoundaries");
  });
});
