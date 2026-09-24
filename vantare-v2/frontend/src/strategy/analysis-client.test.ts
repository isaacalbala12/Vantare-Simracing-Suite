import { describe, expect, it, vi } from "vitest";
import { Call } from "@wailsio/runtime";
import { createAnalysisClient, createNativeAnalysisTransport, type AnalysisSaveRequest } from "./analysis-client";
import { parseAnalysisClassificationCorrection } from "./analysis-contract";
import type { AnalysisBase, AnalysisClassificationCorrection, AnalysisCorrection, AnalysisFamilyCorrection, AnalysisPreparedClassificationCorrection, AnalysisPreparedCorrection, AnalysisPreparedFamilyCorrection, AnalysisRevision, AnalysisSaveCommand, AnalysisSnapshot } from "./analysis-contract";
import snapshotV4 from "./testdata/analysis-identity-snapshot-v4.json";
vi.mock("@wailsio/runtime", () => ({ Call: { ByName: vi.fn() } }));
describe("native Analysis client", () => {
  it("validates the copy result and never dispatches an empty folder", async () => {
    const call = vi.fn().mockResolvedValue({ path: "C:\\kept\\copy.duckdb", contentSha256: "a".repeat(64), sizeBytes: 1024 });
    const client = createAnalysisClient({ call });
    await expect(client.saveVerifiedCopy("handle", " ")).rejects.toThrow("request.destinationDirectory");
    expect(call).not.toHaveBeenCalled();
    await expect(client.saveVerifiedCopy("handle", "C:\\kept")).resolves.toMatchObject({ sizeBytes: 1024 });
    expect(call).toHaveBeenCalledExactlyOnceWith("SaveVerifiedCopy", [{ sessionId: "handle", destinationDirectory: "C:\\kept", userApproved: true }], undefined);
    call.mockResolvedValueOnce({ path: "C:\\kept\\copy.duckdb", contentSha256: "wrong", sizeBytes: 1024 });
    await expect(client.saveVerifiedCopy("handle", "C:\\kept")).rejects.toThrow("copy.result");
  });
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
  it("recovers a complete pending command with the current handle and acknowledges it exactly", async () => {
    const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "v1", segmentationDigest: "b".repeat(64) };
    const command = { expectedRevision: "c".repeat(64), commandId: "pending-command", reason: "Reviewed", localAuthorId: "local" };
    const stored = { corrections: [], familyUses: [], classifications: [], stintBoundaries: [], command, commandDigest: "d".repeat(64) };
    const call = vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(undefined).mockResolvedValueOnce(null);
    const client = createAnalysisClient({ call });
    const pending = await client.pending("fresh-handle", base);
    expect(pending).toEqual({ sessionId: "fresh-handle", base, corrections: [], familyUses: [], classifications: [], stintBoundaries: [], command });
    expect(call).toHaveBeenNthCalledWith(1, "LoadPendingCorrectionCommand", [{ sessionId: "fresh-handle", base }], undefined);
    if (!pending) throw new Error("expected pending command");
    await client.acknowledge(pending);
    expect(call).toHaveBeenNthCalledWith(2, "AcknowledgeCorrectionCommand", [{ sessionId: "fresh-handle", base, commandId: "pending-command" }], undefined);
    await expect(client.pending("fresh-handle", base)).resolves.toBeUndefined();
  });
  it("rejects an incomplete pending command before exposing it", async () => {
    const base = { sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "v1", segmentationDigest: "b".repeat(64) };
    const call = vi.fn().mockResolvedValue({ corrections: [], familyUses: [], classifications: [], command: { expectedRevision: "c".repeat(64), commandId: "pending-command", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "d".repeat(64) });
    await expect(createAnalysisClient({ call }).pending("handle", base)).rejects.toThrow("pending.complete");
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

describe("classification command transport", () => {
  const freshBase = (): AnalysisBase => ({ sessionId: "source", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: "b".repeat(64) });
  const freshCommand = (): AnalysisSaveCommand => ({ expectedRevision: "a".repeat(64), commandId: "class-cmd", reason: "Reviewed classification", localAuthorId: "local-user" });
  const sessionFix = (base: AnalysisBase): AnalysisClassificationCorrection => ({ base: structuredClone(base), field: "SessionType", expectedOriginal: "practice", replacement: "race", reason: "Stewards bulletin", provenance: "manual" });
  const weatherFix = (base: AnalysisBase): AnalysisClassificationCorrection => ({ base: structuredClone(base), field: "WeatherConditions", expectedOriginal: "Sunny", replacement: "Overcast", reason: "Metar check", provenance: "manual" });
  const familyFix = (base: AnalysisBase): AnalysisFamilyCorrection => ({ base: structuredClone(base), target: { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" }, family: "combined_stint_pace_curve", expected: { family: "combined_stint_pace_curve", included: true, exclusionReasons: null }, included: false, reason: "Reviewed" });
  const prepared = (request: AnalysisClassificationCorrection, correctionId: string, corrected: string): AnalysisPreparedClassificationCorrection => ({ baseId: "a".repeat(64), correctionId, request: structuredClone(request), original: request.expectedOriginal, corrected });
  const preparedFamily = (request: AnalysisFamilyCorrection): AnalysisPreparedFamilyCorrection => ({ baseId: "a".repeat(64), correctionId: "b".repeat(64), request: structuredClone(request), original: structuredClone(request.expected), corrected: { family: request.family, included: request.included, exclusionReasons: ["manual_exclusion"] } });
  const scalarFix = (base: AnalysisBase, index: number): AnalysisCorrection => ({ base: structuredClone(base), target: { channelId: "fuel", column: "mix", sampleIndex: index }, unit: { quality: "valid" }, expected: { column: "mix", present: true, quality: "valid", scalar: { kind: "number", number: 1000 + index } }, replacement: { kind: "number", number: 2000 + index }, reason: "fix" });
  const preparedScalar = (request: AnalysisCorrection, correctionId: string): AnalysisPreparedCorrection => ({ baseId: "a".repeat(64), correctionId, request: structuredClone(request), original: structuredClone(request.expected), corrected: { column: request.expected.column, present: request.expected.present, quality: request.expected.quality, scalar: structuredClone(request.replacement) } });
  const correctionIdFor = (index: number): string => (index + 1).toString(16).padStart(64, "0");
  type SnapshotInput = {
    contractVersion: AnalysisSnapshot["contractVersion"];
    corrections?: AnalysisPreparedCorrection[];
    familyUses?: AnalysisPreparedFamilyCorrection[];
    classifications?: AnalysisPreparedClassificationCorrection[];
  };
  const savedRevision = (command: AnalysisSaveCommand, base: AnalysisBase, snapshot: SnapshotInput, revisionId = "b".repeat(64)): AnalysisRevision => ({ revisionId, parentRevisionId: command.expectedRevision, command: structuredClone(command), commandDigest: "b".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { base: structuredClone(base), snapshotId: "b".repeat(64), corrections: [], ...structuredClone(snapshot) } });

  it("rejects a stored revision whose classification reason differs", async () => {
    const base = freshBase();
    const command = freshCommand();
    const fix = sessionFix(base);
    const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [fix] };
    const stored: AnalysisClassificationCorrection = { ...fix, reason: "other cause" };
    const revision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(stored, "b".repeat(64), "race")] });
    const call = vi.fn().mockResolvedValue({ found: true, headId: "b".repeat(64), revision });
    const client = createAnalysisClient({ call });
    await expect(client.resolve(structuredClone(request))).rejects.toThrow("resolve.requestMismatch");
  });

  it("accepts a replayed command as its stored revision even after the head advances", async () => {
    const base = freshBase();
    const command = freshCommand();
    const fix = sessionFix(base);
    const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [fix] };
    const oldRevisionId = "b".repeat(64);
    const advancedHeadId = "c".repeat(64);
    const revision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(fix, "b".repeat(64), "race")] }, oldRevisionId);
    const saveCall = vi.fn().mockResolvedValue({ headId: advancedHeadId, revision });
    const saved = await createAnalysisClient({ call: saveCall }).save(request);
    expect(saved.revision.revisionId).toBe(oldRevisionId);
    expect(saved.headId).toBe(advancedHeadId);
    const resolveCall = vi.fn().mockResolvedValue({ found: true, headId: advancedHeadId, revision });
    const resolved = await createAnalysisClient({ call: resolveCall }).resolve(request);
    expect(resolved).toMatchObject({ found: true, headId: advancedHeadId });
    if (resolved.found) {
      expect(resolved.revision.revisionId).toBe(oldRevisionId);
    } else {
      throw new Error("expected the replayed command to be found");
    }
  });

  it("sends class-only and legacy payloads without normalizing omissions", async () => {
    const base = freshBase();
    const command = freshCommand();
    const only = sessionFix(base);
    const classOnly: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [only] };
    const revision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(only, "b".repeat(64), "race")] });
    const call = vi.fn().mockResolvedValue({ headId: "b".repeat(64), revision });
    const client = createAnalysisClient({ call });
    await expect(client.save(classOnly)).resolves.toMatchObject({ headId: "b".repeat(64) });
    expect(call.mock.calls[0][1][0]).toBe(classOnly);

    const legacy = { sessionId: "handle", base, corrections: [], command };
    const legacyRevision = savedRevision(command, base, { contractVersion: "analysis.sample-snapshot.v1" });
    call.mockResolvedValue({ headId: "b".repeat(64), revision: legacyRevision });
    await expect(client.save(legacy)).resolves.toMatchObject({ headId: "b".repeat(64) });
    const sent = call.mock.calls.at(-1)?.[1][0] as Record<string, unknown>;
    expect(sent).toBe(legacy);
    expect("familyUses" in sent).toBe(false);
    expect("classifications" in sent).toBe(false);
  });

  it("retires to v1/v2 snapshots with explicit empty groups", async () => {
    const base = freshBase();
    const command = freshCommand();
    const call = vi.fn();
    const client = createAnalysisClient({ call });
    call.mockResolvedValue({ headId: "b".repeat(64), revision: savedRevision(command, base, { contractVersion: "analysis.sample-snapshot.v1" }) });
    const retire = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [] };
    await expect(client.save(retire)).resolves.toMatchObject({ headId: "b".repeat(64) });
    expect(call.mock.calls[0][1][0]).toBe(retire);

    const family = familyFix(base);
    const preparedFamily = { baseId: "a".repeat(64), correctionId: "b".repeat(64), request: family, original: family.expected, corrected: { family: family.family, included: false, exclusionReasons: ["manual_exclusion"] } };
    call.mockResolvedValue({ headId: "b".repeat(64), revision: savedRevision(command, base, { contractVersion: "analysis.observation-snapshot.v2", familyUses: [preparedFamily] }) });
    const toV2 = { sessionId: "handle", base, corrections: [], familyUses: [family], command, classifications: [] };
    await expect(client.save(toV2)).resolves.toMatchObject({ headId: "b".repeat(64) });
  });

  it("rejects invalid classification payloads before dispatch", async () => {
    const base = freshBase();
    const command = freshCommand();
    const good = sessionFix(base);
    const invalid: Array<Record<string, unknown>> = [
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(good), field: "CarName" }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(good), replacement: "sprint" }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(weatherFix(base)), replacement: "   " }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(good), reason: "  " }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(good), provenance: "auto" }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [{ ...structuredClone(good), base: { ...structuredClone(base), sessionId: "foreign" } }] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [structuredClone(good), structuredClone(good)] },
      { sessionId: "handle", base, corrections: [], command, classifications: [structuredClone(good)] },
      { sessionId: "handle", base, corrections: [], familyUses: null, command, classifications: [structuredClone(good)] },
      { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: null },
    ];
    for (const request of invalid) {
      const malformed = request as unknown as AnalysisSaveRequest;
      const call = vi.fn();
      await expect(createAnalysisClient({ call }).save(malformed)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
      const call2 = vi.fn();
      await expect(createAnalysisClient({ call: call2 }).resolve(malformed)).rejects.toThrow();
      expect(call2).not.toHaveBeenCalled();
    }
  });

  it("enforces the three-group quota before traversing entries", async () => {
    const base = freshBase();
    const command = freshCommand();
    const good = sessionFix(base);
    const full = Array.from({ length: 254 }, (_, index) => scalarFix(base, index));
    const family = familyFix(base);
    const atLimit: AnalysisSaveRequest = { sessionId: "handle", base, corrections: full, familyUses: [family], command, classifications: [good] };
    const atLimitRevision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", corrections: full.map((item, index) => preparedScalar(item, correctionIdFor(index))), familyUses: [preparedFamily(family)], classifications: [prepared(good, "b".repeat(64), "race")] });
    const okCall = vi.fn().mockResolvedValue({ headId: "b".repeat(64), revision: atLimitRevision });
    const stored = await createAnalysisClient({ call: okCall }).save(atLimit);
    expect(okCall).toHaveBeenCalledTimes(1);
    expect(stored.headId).toBe("b".repeat(64));
    expect(stored.revision.snapshot.corrections).toHaveLength(254);
    expect(stored.revision.snapshot.familyUses).toHaveLength(1);
    expect(stored.revision.snapshot.classifications).toHaveLength(1);
    expect(stored.revision.snapshot.classifications?.[0]?.request.field).toBe("SessionType");

    const over = Array.from({ length: 256 }, (_, index) => scalarFix(base, index));
    const overRequest: AnalysisSaveRequest = { sessionId: "handle", base, corrections: over, familyUses: [], command, classifications: [structuredClone(good)] };
    const overCall = vi.fn();
    await expect(createAnalysisClient({ call: overCall }).save(overRequest)).rejects.toThrow("request.quota");
    expect(overCall).not.toHaveBeenCalled();

    let touched = false;
    const poisoned: unknown[] = new Array(1);
    Object.defineProperty(poisoned, "0", { get() { touched = true; throw new Error("getter.accessed"); }, enumerable: true, configurable: true });
    const poisonedRequest: Record<string, unknown> = { sessionId: "handle", base, corrections: over, familyUses: [], command, classifications: poisoned };
    const poisonedCall = vi.fn();
    await expect(createAnalysisClient({ call: poisonedCall }).save(poisonedRequest as unknown as AnalysisSaveRequest)).rejects.toThrow("request.quota");
    expect(poisonedCall).not.toHaveBeenCalled();
    expect(touched).toBe(false);
  });

  it("rejects mismatched classification responses in save and resolve, accepts reorder", async () => {
    const base = freshBase();
    const command = freshCommand();
    const first = sessionFix(base);
    const second = weatherFix(base);
    const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [first, second] };
    const goodSnapshot: SnapshotInput = { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(second, "c".repeat(64), "Overcast"), prepared(first, "b".repeat(64), "race")] };
    const goodRevision = savedRevision(command, base, goodSnapshot);
    for (const method of ["save", "resolve"] as const) {
      const invoke = async (payload: AnalysisSaveRequest, response: unknown) => {
        const call = vi.fn().mockResolvedValue(response);
        const client = createAnalysisClient({ call });
        return client[method](structuredClone(payload));
      };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: goodRevision } : { found: true, headId: "b".repeat(64), revision: goodRevision })).resolves.toMatchObject(method === "save" ? { headId: "b".repeat(64) } : { found: true });

      const missing: AnalysisRevision = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(first, "b".repeat(64), "race")] } };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: missing } : { found: true, headId: "b".repeat(64), revision: missing })).rejects.toThrow(`${method}.requestMismatch`);

      const singleRequest: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [first] };
      await expect(invoke(singleRequest, method === "save" ? { headId: "b".repeat(64), revision: goodRevision } : { found: true, headId: "b".repeat(64), revision: goodRevision })).rejects.toThrow(`${method}.requestMismatch`);

      const wrongOriginal: AnalysisClassificationCorrection = { ...second, expectedOriginal: "Cloudy" };
      const wrongOriginalRevision: AnalysisRevision = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(wrongOriginal, "c".repeat(64), "Overcast"), prepared(first, "b".repeat(64), "race")] } };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: wrongOriginalRevision } : { found: true, headId: "b".repeat(64), revision: wrongOriginalRevision })).rejects.toThrow(`${method}.requestMismatch`);

      const wrongReplacement: AnalysisClassificationCorrection = { ...second, replacement: "Clear" };
      const wrongReplacementRevision: AnalysisRevision = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(wrongReplacement, "c".repeat(64), "Clear"), prepared(first, "b".repeat(64), "race")] } };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: wrongReplacementRevision } : { found: true, headId: "b".repeat(64), revision: wrongReplacementRevision })).rejects.toThrow(`${method}.requestMismatch`);

      const wrongReason: AnalysisClassificationCorrection = { ...second, reason: "other cause" };
      const wrongReasonRevision: AnalysisRevision = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(wrongReason, "c".repeat(64), "Overcast"), prepared(first, "b".repeat(64), "race")] } };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: wrongReasonRevision } : { found: true, headId: "b".repeat(64), revision: wrongReasonRevision })).rejects.toThrow(`${method}.requestMismatch`);

      const fieldSwapRevision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(weatherFix(base), "c".repeat(64), "Overcast")] });
      await expect(invoke(singleRequest, method === "save" ? { headId: "b".repeat(64), revision: fieldSwapRevision } : { found: true, headId: "b".repeat(64), revision: fieldSwapRevision })).rejects.toThrow(`${method}.requestMismatch`);

      for (const key of ["commandId", "reason", "localAuthorId"] as const) {
        const badCommand: AnalysisSaveCommand = { ...command, [key]: "other" };
        const badRevision: AnalysisRevision = { ...goodRevision, command: badCommand };
        await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: badRevision } : { found: true, headId: "b".repeat(64), revision: badRevision })).rejects.toThrow(`${method}.requestMismatch`);
      }
      const movedCommand: AnalysisSaveCommand = { ...command, expectedRevision: "c".repeat(64) };
      const movedRevision: AnalysisRevision = { ...goodRevision, command: movedCommand, parentRevisionId: "c".repeat(64) };
      await expect(invoke(request, method === "save" ? { headId: "b".repeat(64), revision: movedRevision } : { found: true, headId: "b".repeat(64), revision: movedRevision })).rejects.toThrow(`${method}.requestMismatch`);
    }

    const autoRequest = { ...second, provenance: "auto" } as unknown as AnalysisClassificationCorrection;
    const autoRevision: unknown = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(autoRequest, "c".repeat(64), "Overcast"), prepared(first, "b".repeat(64), "race")] } };
    await expect(createAnalysisClient({ call: vi.fn().mockResolvedValue({ found: true, headId: "b".repeat(64), revision: autoRevision }) }).resolve(structuredClone(request))).rejects.toThrow();

    const loneRequest: AnalysisClassificationCorrection = { ...second, base: { ...base, sessionId: "foreign" } };
    const loneRevision: unknown = { ...goodRevision, snapshot: { ...goodRevision.snapshot, classifications: [prepared(first, "b".repeat(64), "race"), prepared(loneRequest, "c".repeat(64), "Overcast")] } };
    await expect(createAnalysisClient({ call: vi.fn().mockResolvedValue({ found: true, headId: "b".repeat(64), revision: loneRevision }) }).resolve(structuredClone(request))).rejects.toThrow();

    const foreign: AnalysisBase = { ...base, sessionId: "foreign" };
    const foreignFirst: AnalysisClassificationCorrection = { ...first, base: structuredClone(foreign) };
    const foreignSecond: AnalysisClassificationCorrection = { ...second, base: structuredClone(foreign) };
    const foreignRevision = savedRevision(command, foreign, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(foreignSecond, "c".repeat(64), "Overcast"), prepared(foreignFirst, "b".repeat(64), "race")] });
    await expect(createAnalysisClient({ call: vi.fn().mockResolvedValue({ found: true, headId: "b".repeat(64), revision: foreignRevision }) }).resolve(structuredClone(request))).rejects.toThrow("resolve.requestMismatch");
  });

  it("keeps the full save payload on cancel or transport error without retry", async () => {
    const base = freshBase();
    const command = freshCommand();
    const fix = sessionFix(base);
    const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications: [fix] };
    const before = structuredClone(request);

    const idle = vi.fn();
    await expect(createAnalysisClient({ call: idle }).save(request, AbortSignal.abort())).rejects.toThrow();
    expect(idle).not.toHaveBeenCalled();
    expect(request).toEqual(before);

    let release!: (value: unknown) => void;
    const pendingCall = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const pending = createAnalysisClient({ call: pendingCall }).save(request, controller.signal);
    controller.abort();
    const lateRevision = savedRevision(command, base, { contractVersion: "analysis.mixed-snapshot.v3", familyUses: [], classifications: [prepared(fix, "b".repeat(64), "race")] });
    release({ headId: "b".repeat(64), revision: lateRevision });
    await expect(pending).rejects.toThrow();
    expect(pendingCall).toHaveBeenCalledTimes(1);
    expect(request).toEqual(before);

    const failing = vi.fn().mockRejectedValue(new Error("unavailable"));
    await expect(createAnalysisClient({ call: failing }).save(request)).rejects.toThrow("unavailable");
    expect(failing).toHaveBeenCalledTimes(1);
    expect(request).toEqual(before);

    const missing = vi.fn().mockResolvedValue({ found: false, headId: "a".repeat(64) });
    await expect(createAnalysisClient({ call: missing }).resolve(request)).resolves.toEqual({ found: false, headId: "a".repeat(64) });
    expect(missing).toHaveBeenCalledTimes(1);

    const malformed = createAnalysisClient({ call: async () => ({ found: true, headId: "b".repeat(64), revision: null }) });
    await expect(malformed.resolve(request)).rejects.toThrow();
  });
  it("correlates v4 identity commands by their shared reference and rejects incoherent targets without retry", async () => {
    const base: AnalysisBase = snapshotV4.base;
    const command = freshCommand();
    const classifications = snapshotV4.classifications.map(item => parseAnalysisClassificationCorrection(structuredClone(item.request)));
    const request: AnalysisSaveRequest = { sessionId: "handle", base, corrections: [], familyUses: [], command, classifications };
    const revisionFor = (snapshot: unknown): AnalysisRevision => ({ revisionId: "b".repeat(64), parentRevisionId: command.expectedRevision, command: structuredClone(command), commandDigest: "b".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: snapshot as unknown as AnalysisSnapshot });
    const stored = (mutate: (snapshot: { canonicalCombination?: Record<string, unknown>; classifications: { request: Record<string, unknown> }[] }) => void): AnalysisRevision => {
      const snapshot = structuredClone(snapshotV4) as unknown as { canonicalCombination?: Record<string, unknown>; classifications: { request: Record<string, unknown> }[] };
      mutate(snapshot);
      return revisionFor(snapshot);
    };
    const divergent = `lmu:${"9".repeat(64)}`;
    for (const method of ["save", "resolve"] as const) {
      const invoke = (payload: AnalysisSaveRequest, revision: AnalysisRevision) => {
        const call = vi.fn().mockResolvedValue(method === "save" ? { headId: "b".repeat(64), revision } : { found: true, headId: "b".repeat(64), revision });
        return { call, result: createAnalysisClient({ call })[method](payload) };
      };
      const accepted = invoke(request, revisionFor(structuredClone(snapshotV4)));
      await expect(accepted.result).resolves.toMatchObject(method === "save" ? { headId: "b".repeat(64) } : { found: true });
      expect(accepted.call).toHaveBeenCalledTimes(1);
      for (const revision of [
        stored(snapshot => { delete snapshot.classifications[1].request.canonicalCombinationId; }),
        stored(snapshot => { snapshot.classifications[1].request.canonicalCombinationId = divergent; }),
        stored(snapshot => { delete snapshot.canonicalCombination; }),
        stored(snapshot => { snapshot.canonicalCombination!.trackName = "Other"; }),
      ]) {
        const rejected = invoke(request, revision);
        await expect(rejected.result).rejects.toThrow();
        expect(rejected.call).toHaveBeenCalledTimes(1);
      }
      const coherent = stored(snapshot => { snapshot.canonicalCombination!.id = divergent; snapshot.classifications[1].request.canonicalCombinationId = divergent; });
      const mismatched = invoke(request, coherent);
      await expect(mismatched.result).rejects.toThrow(`${method}.requestMismatch`);
      expect(mismatched.call).toHaveBeenCalledTimes(1);
      const changed = invoke({ ...request, classifications: classifications.map(item => item.field === "TrackName" ? { ...item, canonicalCombinationId: divergent } : item) }, revisionFor(structuredClone(snapshotV4)));
      await expect(changed.result).rejects.toThrow(`${method}.requestMismatch`);
      expect(changed.call).toHaveBeenCalledTimes(1);
    }
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
