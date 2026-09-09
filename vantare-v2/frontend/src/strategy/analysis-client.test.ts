import { describe, expect, it, vi } from "vitest";
import { Call } from "@wailsio/runtime";
import { createAnalysisClient, createNativeAnalysisTransport } from "./analysis-client";
vi.mock("@wailsio/runtime", () => ({ Call: { ByName: vi.fn() } }));
describe("native Analysis client", () => {
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
