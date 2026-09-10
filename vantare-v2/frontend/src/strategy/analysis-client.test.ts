import { describe, expect, it, vi } from "vitest";
import { Call } from "@wailsio/runtime";
import { createAnalysisClient, createNativeAnalysisTransport } from "./analysis-client";
vi.mock("@wailsio/runtime", () => ({ Call: { ByName: vi.fn() } }));
describe("native Analysis client", () => {
  it("resolves an exact command without replay and rejects another command or source", async () => {
    const a = "a".repeat(64), b = "b".repeat(64);
    const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
    const command = { expectedRevision: a, commandId: "stable-command", reason: "Checked", localAuthorId: "local-user" };
    const request = { sessionId: "handle", base, corrections: [], command };
    const revision = { revisionId: b, parentRevisionId: a, command, commandDigest: b, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: b, corrections: [] } };
    const call = vi.fn().mockResolvedValue({ found: false, headId: a });
    const client = createAnalysisClient({ call });
    await expect(client.resolve(request)).resolves.toEqual({ found: false, headId: a });
    expect(call).toHaveBeenCalledExactlyOnceWith("ResolveCorrectionCommand", [request], undefined);
    call.mockResolvedValue({ found: true, headId: b, revision });
    await expect(client.resolve(request)).resolves.toMatchObject({ found: true, revision });
    await expect(client.resolve({ ...request, command: { ...command, commandId: "other" } })).rejects.toThrow("resolve.requestMismatch");
    await expect(client.resolve({ ...request, base: { ...base, sessionId: "foreign" } })).rejects.toThrow("resolve.requestMismatch");
    call.mockClear();
    await expect(client.resolve({ ...request, command: { ...command, reason: "" } })).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it("uses the closed native method and cancellation boundary", async () => {
    const cancelOn = vi.fn().mockResolvedValue({ available: true, code: "ready" });
    vi.mocked(Call.ByName).mockReturnValue({ cancelOn } as unknown as ReturnType<typeof Call.ByName>);
    const controller = new AbortController();
    const client = createAnalysisClient(createNativeAnalysisTransport());
    await expect(client.status(controller.signal)).resolves.toEqual({ available: true, code: "ready" });
    expect(Call.ByName).toHaveBeenCalledWith("github.com/vantare/overlays/v2/internal/app.TelemetryAnalysisService.Status");
    expect(cancelOn).toHaveBeenCalledWith(controller.signal);
  });
  it("does not dispatch an already cancelled operation or retry errors", async () => {
    const call = vi.fn().mockRejectedValue(new Error("unavailable"));
    const client = createAnalysisClient({ call });
    const controller = new AbortController();
    controller.abort();
    await expect(client.discover(controller.signal)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
    await expect(client.discover()).rejects.toThrow("unavailable");
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("discards a late cancelled response and never turns malformed discovery into empty data", async () => {
    let finish: (value: unknown) => void = () => {
      throw new Error("not started");
    };
    const client = createAnalysisClient({ call: () => new Promise((resolve) => {
        finish = resolve;
      }) });
    const controller = new AbortController();
    const pending = client.discover(controller.signal);
    controller.abort();
    finish([]);
    await expect(pending).rejects.toThrow();
    const malformed = createAnalysisClient({ call: async () => null });
    await expect(malformed.discover()).rejects.toThrow();
  });
  it("forwards consent explicitly without deriving it from a ready candidate", async () => {
    const call = vi.fn().mockRejectedValue(new Error("approval required"));
    const client = createAnalysisClient({ call });
    await expect(client.open("candidate", false)).rejects.toThrow("approval required");
    expect(call).toHaveBeenCalledWith("Open", [{ candidateId: "candidate", userApproved: false }], undefined);
  });
  it("rejects pages belonging to another request or with gaps", async () => {
    const response = { channel_id: "fuel", start: 4, sampling: { kind: "event_timestamped", origin: "source_timestamp" }, samples: [{ index: 4, values: [] }] };
    const call = vi.fn().mockResolvedValue(response);
    const client = createAnalysisClient({ call });
    const request = { sessionId: "handle", channelId: "fuel", start: 4, limit: 1 };
    await expect(client.page(request)).resolves.toEqual(response);
    await expect(client.page({ ...request, channelId: "pace" })).rejects.toThrow("requestMismatch");
    response.samples[0].index = 5;
    await expect(client.page(request)).rejects.toThrow("sample.order");
  });
  it("requires an exact revision for projection before dispatch", async () => {
    const call = vi.fn();
    const client = createAnalysisClient({ call });
    const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "v1", segmentationDigest: "b".repeat(64) };
    await expect(client.project({ sessionId: "handle", base, revisionId: "" })).rejects.toThrow("exactRevisionRequired");
    expect(call).not.toHaveBeenCalled();
  });
  it("does not substitute another revision or source on load", async () => {
    const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "v1", segmentationDigest: "b".repeat(64) };
    const revisionId = "c".repeat(64);
    const response = { headId: revisionId, revision: { revisionId, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: revisionId, corrections: [] } } };
    const client = createAnalysisClient({ call: async () => response });
    await expect(client.load({ sessionId: "handle", base, revisionId })).resolves.toEqual(response);
    await expect(client.load({ sessionId: "handle", base, revisionId: "d".repeat(64) })).rejects.toThrow("requestMismatch");
    await expect(client.load({ sessionId: "handle", base: { ...base, sessionId: "other" }, revisionId })).rejects.toThrow("requestMismatch");
  });
});

describe("complete family command transport", () => {
  it("keeps explicit empty families and rejects altered resolution payloads", async () => {
    const a = "a".repeat(64), b = "b".repeat(64);
    const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
    const family = { base, target: { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" }, family: "combined_stint_pace_curve" as const, expected: { family: "combined_stint_pace_curve", included: true, exclusionReasons: null }, included: false, reason: "Reviewed" };
    const command = { expectedRevision: a, commandId: "mixed", reason: "Review", localAuthorId: "local" };
    const request = { sessionId: "handle", base, corrections: [], familyUses: [family], command };
    const revision = { revisionId: b, parentRevisionId: a, command, commandDigest: b, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.observation-snapshot.v2", base, snapshotId: b, corrections: [], familyUses: [{ baseId: a, correctionId: b, request: family, original: family.expected, corrected: { family: family.family, included: false, exclusionReasons: ["manual_exclusion"] } }] } };
    const call = vi.fn().mockResolvedValue({ found: true, headId: b, revision });
    const client = createAnalysisClient({ call });
    await expect(client.resolve(request)).resolves.toMatchObject({ found: true });
    expect(call.mock.calls[0][1][0]).toBe(request);
    await expect(client.resolve({ ...request, familyUses: [] })).rejects.toThrow("resolve.requestMismatch");
    await expect(client.resolve({ ...request, familyUses: [{ ...family, reason: "other" }] })).rejects.toThrow("resolve.requestMismatch");
    call.mockResolvedValue({ headId: b, revision });
    await expect(client.save({ ...request, familyUses: [] })).rejects.toThrow("save.requestMismatch");
    call.mockResolvedValue({ headId: b, revision: { ...revision, snapshot: { ...revision.snapshot, contractVersion: "analysis.sample-snapshot.v1", familyUses: undefined } } });
    const restore = { ...request, familyUses: [] };
    await expect(client.save(restore)).resolves.toMatchObject({ headId: b });
    expect(call.mock.calls.at(-1)?.[1][0]).toBe(restore);
    call.mockClear();
    await expect(client.save({ ...request, familyUses: [family, family] })).rejects.toThrow("overlap");
    expect(call).not.toHaveBeenCalled();
  });
});

describe("native lap inspection transport", () => {
  it("queries only an exact authorized revision and validates pagination", async () => {
    const a = "a".repeat(64), b = "b".repeat(64);
    const base = { sessionId: "source", contentSha256: a, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: b };
    const request = { sessionId: "handle", base, revisionId: a, start: 0, limit: 50 };
    const response = { revisionId: a, headId: b, page: { base, snapshotId: a, start: 0, total: 0, laps: [] } };
    const call = vi.fn().mockResolvedValue(response), client = createAnalysisClient({ call });
    await expect(client.laps(request)).resolves.toBe(response);
    expect(call).toHaveBeenCalledExactlyOnceWith("InspectCorrectionLaps", [request], undefined);
    call.mockResolvedValue({ ...response, revisionId: b });
    await expect(client.laps(request)).rejects.toThrow("laps.requestMismatch");
    call.mockResolvedValue({ ...response, page: { ...response.page, start: 1 } });
    await expect(client.laps(request)).rejects.toThrow("laps.requestMismatch");
    call.mockClear();
    await expect(client.laps({ ...request, revisionId: "" })).rejects.toThrow();
    await expect(client.laps({ ...request, limit: 51 })).rejects.toThrow();
    const abort = new AbortController(); abort.abort();
    await expect(client.laps(request, abort.signal)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
