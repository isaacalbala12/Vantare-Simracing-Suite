import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import { parseAnalysisPreparation, parseCorrectionStoreResult } from "../../strategy/analysis-contract";
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
  it("retains explicit native edit capability without inferring it for older responses", async () => {
    const { client, api, base, revision } = fixture();
    expect((await openRecordedSession(api, "candidate", "combo", revision)).editableChannelIds).toEqual([]);
    const editableChannelIds = ["fuel"];
    client.prepare.mockResolvedValue({ base, baseRevisionId: "f".repeat(64), editableChannelIds });
    const opened = await openRecordedSession(api, "candidate", "combo", revision);
    editableChannelIds.length = 0;
    expect(opened.editableChannelIds).toEqual(["fuel"]);
  });
  it("resolves a first source from its native identity without a preselected combination", async () => {
    const { client, api, base, revision } = fixture();
    const combination = { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "Grand Prix", carName: "Car", carClass: "LMP2" };
    client.prepare.mockResolvedValue({ base, baseRevisionId: "f".repeat(64), combination });
    client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...revision, revisionId: "f".repeat(64) }] });
    const result = await openRecordedSession(api, "candidate", undefined);
    expect(result).toMatchObject({ combinationId: "combo", combination });
    expect(client.open).toHaveBeenCalledExactlyOnceWith("candidate", true);
    expect(client.close).not.toHaveBeenCalled();
  });
  it("closes an unidentified first source before projecting and reports the missing identity", async () => {
    const { client, api } = fixture();
    await expect(openRecordedSession(api, "candidate", undefined)).rejects.toThrow("recorded_combination_unavailable");
    expect(client.project).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("rejects preparation for a different selected combination before projecting", async () => {
    const { client, api, base } = fixture();
    client.prepare.mockResolvedValue({ base, baseRevisionId: "f".repeat(64), combination: { id: "other", simId: "lmu", trackName: "Monza", trackLayout: "GP", carName: "Car", carClass: "LMP2" } });
    await expect(openRecordedSession(api, "candidate", "combo")).rejects.toThrow("recorded_combination_mismatch");
    expect(client.project).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("reopens the selected exact revision and retains its handle for Strategy", async () => {
    const { client, api, base, revision } = fixture();
    const result = await openRecordedSession(api, "candidate", "combo", revision);
    expect(client.open).toHaveBeenCalledWith("candidate", true);
    expect(client.project).toHaveBeenCalledWith({ sessionId: "handle", base, revisionId: revision.revisionId }, undefined);
    expect(result.revision).toEqual(revision);
    expect(client.close).not.toHaveBeenCalled();
  });
  it("starts a new selection from the explicit base, never from current head", async () => {
    const { client, api, base, revision } = fixture();
    client.project.mockResolvedValue({ combinationId: "combo", sourceRevisions: [{ ...revision, revisionId: "f".repeat(64) }] });
    await openRecordedSession(api, "candidate", "combo");
    expect(client.project).toHaveBeenCalledWith({ sessionId: "handle", base, revisionId: "f".repeat(64) }, undefined);
  });
  it("matches a saved revision by stable identity after opening its candidate", async () => {
    const { client, api, revision } = fixture();
    const result = await openRecordedSession(api, "candidate", "combo", [{ ...revision, sessionId: "other" }, revision]);
    expect(result.revision).toEqual(revision);
    expect(client.project.mock.calls[0][0].revisionId).toBe(revision.revisionId);
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

// Contract fixtures below are hand-built shapes, not real recorded data.
function inspectionFixture() {
  const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "1", segmentationDigest: "b".repeat(64) };
  const baseDigest = "e".repeat(64);
  const initial = "f".repeat(64);
  const prepared = parseAnalysisPreparation({ base, baseRevisionId: initial, baseDigest, combinationUnavailableReason: "metadata_unavailable" });
  const stored = parseCorrectionStoreResult({ headId: initial, revision: { revisionId: initial, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: initial, corrections: [] } } });
  const client = {
    open: vi.fn().mockResolvedValue({ sessionId: "handle", session: { id: "source", schema_version: 1, channels: [], metadata: [] } }),
    prepare: vi.fn().mockResolvedValue(prepared),
    load: vi.fn().mockResolvedValue(stored),
    project: vi.fn().mockResolvedValue({ combinationId: "combo", sourceRevisions: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, api: client as unknown as AnalysisClient, base, baseDigest, initial, prepared, stored };
}

describe("recorded inspection opening", () => {
  it("keeps a metadata-unavailable source open for inspection without projecting", async () => {
    const { api, client, base, baseDigest, initial } = inspectionFixture();
    expect(baseDigest).not.toBe(initial);
    const result = await openRecordedSession(api, "candidate", undefined);
    expect(client.project).not.toHaveBeenCalled();
    expect(client.load).toHaveBeenCalledExactlyOnceWith({ sessionId: "handle", base, revisionId: initial }, undefined);
    expect(result).toMatchObject({ candidateId: "candidate", projectionUnavailableReason: "metadata_unavailable" });
    expect(result.combinationId).toBeUndefined();
    expect(result).not.toHaveProperty("combination");
    expect(result.revision).toEqual({ sessionId: "source", baseDigest, revisionId: initial, snapshotId: initial });
    expect(result.base).toEqual(base);
    expect(client.close).not.toHaveBeenCalled();
  });
  it("ignores a caller combination in the inspection route", async () => {
    const { api, client, baseDigest, initial } = inspectionFixture();
    const result = await openRecordedSession(api, "candidate", "combo");
    expect(client.project).not.toHaveBeenCalled();
    expect(result.projectionUnavailableReason).toBe("metadata_unavailable");
    expect(result.combinationId).toBeUndefined();
    expect(result).not.toHaveProperty("combination");
    expect(result.revision).toEqual({ sessionId: "source", baseDigest, revisionId: initial, snapshotId: initial });
    expect(client.close).not.toHaveBeenCalled();
  });
  it("opens a new unselected source from a list without it and loads the initial revision", async () => {
    const { api, client, initial } = inspectionFixture();
    const foreign = { sessionId: "other", baseDigest: "0".repeat(64), revisionId: "1".repeat(64), snapshotId: "2".repeat(64) };
    const result = await openRecordedSession(api, "candidate", undefined, [foreign]);
    expect(client.load).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revisionId: initial }), undefined);
    expect(result.revision.revisionId).toBe(initial);
    expect(client.close).not.toHaveBeenCalled();
  });
  it("loads the expected exact revision without adopting the head", async () => {
    const { api, client, base, baseDigest } = inspectionFixture();
    const initial = "f".repeat(64);
    const expected = { sessionId: "source", baseDigest, revisionId: "d".repeat(64), snapshotId: "9".repeat(64) };
    const stored = parseCorrectionStoreResult({ headId: "a".repeat(64), revision: { revisionId: expected.revisionId, parentRevisionId: initial, command: { expectedRevision: initial, commandId: "save", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "0".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: expected.snapshotId, corrections: [] } } });
    client.load.mockResolvedValue(stored);
    const result = await openRecordedSession(api, "candidate", undefined, expected);
    expect(client.project).not.toHaveBeenCalled();
    expect(client.load).toHaveBeenCalledExactlyOnceWith({ sessionId: "handle", base, revisionId: expected.revisionId }, undefined);
    expect(result.revision).toEqual(expected);
    expect(client.close).not.toHaveBeenCalled();
  });
  it.each([
    ["foreign single expected", { sessionId: "other" }, "recorded_source_mismatch"],
    ["opened session mismatch", { openedId: "other" }, "recorded_source_mismatch"],
    ["missing digest", { noDigest: true }, "recorded_revision_mismatch"],
    ["malformed digest", { badDigest: "xyz" }, "preparation.baseDigest"],
    ["foreign snapshot", { foreignBase: true }, "recorded_revision_mismatch"],
    ["expected digest mismatch", { digestMismatch: true }, "recorded_revision_mismatch"],
    ["expected snapshot mismatch", { snapshotMismatch: true }, "recorded_revision_mismatch"],
    ["empty expected revision", { emptyRevision: true }, "recorded_revision_mismatch"],
  ])("rejects %s and closes the acquired handle", async (_label: string, mode: Record<string, unknown>, message: string) => {
    const { api, client, base, baseDigest, initial } = inspectionFixture();
    const expected = { sessionId: "source", baseDigest, revisionId: "d".repeat(64), snapshotId: "9".repeat(64) };
    let selection: unknown = undefined;
    if (mode.sessionId) selection = { ...expected, sessionId: mode.sessionId };
    if (mode.openedId) client.open.mockResolvedValue({ sessionId: "handle", session: { id: mode.openedId, schema_version: 1, channels: [], metadata: [] } });
    if (mode.noDigest) client.prepare.mockResolvedValue(parseAnalysisPreparation({ base, baseRevisionId: initial, combinationUnavailableReason: "metadata_unavailable" }));
    if (mode.badDigest) client.prepare.mockResolvedValue({ base, baseRevisionId: initial, baseDigest: mode.badDigest, combinationUnavailableReason: "metadata_unavailable" });
    if (mode.foreignBase) client.load.mockResolvedValue(parseCorrectionStoreResult({ headId: initial, revision: { revisionId: initial, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base: { ...base, sessionId: "other" }, snapshotId: initial, corrections: [] } } }));
    if (mode.digestMismatch || mode.snapshotMismatch || mode.emptyRevision) {
      const stored = parseCorrectionStoreResult({ headId: "a".repeat(64), revision: { revisionId: expected.revisionId, parentRevisionId: initial, command: { expectedRevision: initial, commandId: "save", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "0".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: expected.snapshotId, corrections: [] } } });
      client.load.mockResolvedValue(stored);
      selection = { ...expected };
      if (mode.digestMismatch) selection = { ...expected, baseDigest: "1".repeat(64) };
      if (mode.snapshotMismatch) selection = { ...expected, snapshotId: "2".repeat(64) };
      if (mode.emptyRevision) selection = { ...expected, revisionId: "" };
    }
    await expect(openRecordedSession(api, "candidate", undefined, selection as never)).rejects.toThrow(message);
    expect(client.project).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("propagates a load failure and closes the acquired handle", async () => {
    const { api, client } = inspectionFixture();
    client.load.mockRejectedValue(new Error("auth denied"));
    await expect(openRecordedSession(api, "candidate", undefined)).rejects.toThrow("auth denied");
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("closes a handle whose load response arrives after cancellation", async () => {
    const { api, client, stored } = inspectionFixture();
    const controller = new AbortController();
    client.load.mockImplementation(async () => { controller.abort(); return stored; });
    await expect(openRecordedSession(api, "candidate", undefined, undefined, controller.signal)).rejects.toThrow();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
  it("closes the handle when cancelled during Prepare without starting another read", async () => {
    const { api, client, prepared } = inspectionFixture();
    const controller = new AbortController();
    client.prepare.mockImplementation(async () => { controller.abort(); return prepared; });
    await expect(openRecordedSession(api, "candidate", undefined, undefined, controller.signal)).rejects.toThrow();
    expect(client.load).not.toHaveBeenCalled();
    expect(client.project).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledExactlyOnceWith("handle");
  });
});
