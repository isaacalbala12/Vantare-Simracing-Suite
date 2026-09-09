import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { openRecordedSession } from "./strategy-recorded-session";

function fixture() {
  const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "1", segmentationDigest: "b".repeat(64) };
  const revision = { sessionId: "source", baseDigest: "c".repeat(64), revisionId: "d".repeat(64), snapshotId: "e".repeat(64) };
  const client = {
    open: vi.fn().mockResolvedValue({ sessionId: "handle", session: { id: "source", schema_version: 1, channels: [], metadata: [] } }),
    prepare: vi.fn().mockResolvedValue({ base, baseRevisionId: "f".repeat(64) }),
    project: vi.fn().mockResolvedValue({ combinationId: "combo", sourceRevisions: [revision] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, api: client as unknown as AnalysisClient, base, revision };
}

describe("recorded session ownership", () => {
  it("reopens the selected exact revision and retains its handle for Strategy", async () => {
    const { client, api, base, revision } = fixture();
    const result = await openRecordedSession(api, "candidate", "combo", revision);
    expect(client.open).toHaveBeenCalledWith("candidate", true);
    expect(client.project).toHaveBeenCalledWith({ sessionId: "handle", base, revisionId: revision.revisionId }, undefined);
    expect(result.revision).toEqual(revision);
    expect(client.close).not.toHaveBeenCalled();
  });
  it("starts a new selection from the explicit base, never from current head", async () => {
    const { client, api, base } = fixture();
    await openRecordedSession(api, "candidate", "combo");
    expect(client.project).toHaveBeenCalledWith({ sessionId: "handle", base, revisionId: "f".repeat(64) }, undefined);
  });
  it.each(["source", "combination", "snapshot", "read"])("rejects %s mismatch/failure and closes the acquired handle", async (mode) => {
    const { client, api, revision } = fixture();
    if (mode === "source") revision.sessionId = "foreign";
    if (mode === "combination") client.project.mockResolvedValue({ combinationId: "other", sourceRevisions: [revision] });
    if (mode === "snapshot") client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...revision, snapshotId: "0".repeat(64) }] });
    if (mode === "read") client.prepare.mockRejectedValue(new Error("read failed"));
    await expect(openRecordedSession(api, "candidate", "combo", revision)).rejects.toThrow();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("closes an Open response arriving after cancellation instead of leaking the handle", async () => {
    const { client, api } = fixture();
    const controller = new AbortController();
    client.open.mockImplementation(async () => { controller.abort(); return { sessionId: "late" }; });
    await expect(openRecordedSession(api, "candidate", "combo", undefined, controller.signal)).rejects.toThrow();
    expect(client.prepare).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("late");
  });
  it("does not hide a failed cleanup", async () => {
    const { client, api } = fixture();
    client.prepare.mockRejectedValue(new Error("read failed"));
    client.close.mockRejectedValue(new Error("close failed"));
    await expect(openRecordedSession(api, "candidate", "combo")).rejects.toBeInstanceOf(AggregateError);
  });
});
