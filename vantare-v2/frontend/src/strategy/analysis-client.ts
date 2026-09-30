import { Call } from "@wailsio/runtime";
import { parseInputProjection } from "./strategy-application-client";
import { AnalysisProtocolError, parseAnalysisClassificationCorrections, parseAnalysisLapPage, parseAnalysisFamilyCorrections, parseAnalysisStintBoundaryCorrections, sameAnalysisClassificationCorrections, sameAnalysisFamilyCorrections, sameAnalysisStintBoundaryCorrections, type AnalysisClassificationCorrection, type AnalysisFamilyCorrection, type AnalysisStintBoundaryCorrection, parseAnalysisBase, parseAnalysisCandidates, parseAnalysisCommandResolution, parseAnalysisCorrection, parseAnalysisOpenedSession, parseAnalysisPage, parseAnalysisPreparation, parseAnalysisSaveCommand, parseAnalysisStatus, parseCorrectionStoreResult, sameAnalysisBase, type AnalysisBase, type AnalysisCorrection, type AnalysisRevision, type AnalysisSaveCommand } from "./analysis-contract";
const methods = ["Status", "Discover", "SelectFile", "RecoverCopy", "Open", "SaveVerifiedCopyStatus", "ReadPage", "PrepareCorrections", "InspectCorrectionLaps", "SaveCorrections", "SaveRecoverableCorrections", "LoadPendingCorrectionCommand", "AcknowledgeCorrectionCommand", "ResolveCorrectionCommand", "LoadCorrection", "ProjectCorrection", "CloseSession"] as const;
type AnalysisMethod = typeof methods[number];
export type AnalysisTransport = {
  call(method: AnalysisMethod, args: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
};
export type AnalysisRevisionRequest = Readonly<{
  sessionId: string;
  base: AnalysisBase;
  revisionId: string;
}>;
export type AnalysisSaveRequest = Readonly<{
  sessionId: string;
  base: AnalysisBase;
  corrections: readonly AnalysisCorrection[];
  familyUses?: readonly AnalysisFamilyCorrection[];
  classifications?: readonly AnalysisClassificationCorrection[];
  stintBoundaries?: readonly AnalysisStintBoundaryCorrection[];
  command: AnalysisSaveCommand;
}>;
export type AnalysisLapRequest = AnalysisRevisionRequest & Readonly<{ start: number; limit: number }>;
export type AnalysisPageRequest = Readonly<{
  sessionId: string;
  channelId: string;
  start: number;
  limit: number;
}>;
export function createNativeAnalysisTransport(): AnalysisTransport {
  return { async call(method, args, signal) {
      signal?.throwIfAborted();
      if (!methods.includes(method)) {
        throw new AnalysisProtocolError("method");
      }
      const pending = Call.ByName(`github.com/vantare/overlays/v2/internal/app.TelemetryAnalysisService.${method}`, ...args);
      return await (signal ? pending.cancelOn(signal) : pending);
    } };
}
function identifier(value: string): void {
  if (typeof value !== "string" || value.trim() === "" || new TextEncoder().encode(value).length > 256) {
    throw new AnalysisProtocolError("request.identifier");
  }
}
function revisionRequest(request: AnalysisRevisionRequest): void {
  identifier(request.sessionId);
  parseAnalysisBase(request.base);
  if (typeof request.revisionId !== "string" || (request.revisionId !== "" && !/^[a-f0-9]{64}$/.test(request.revisionId))) {
    throw new AnalysisProtocolError("request.revisionId");
  }
}
function validateSaveRequest(request: AnalysisSaveRequest): void {
  identifier(request.sessionId);
  parseAnalysisBase(request.base);
  parseAnalysisSaveCommand(request.command);
  if (!Array.isArray(request.corrections)) throw new AnalysisProtocolError("request.corrections");
  if (request.familyUses === null) throw new AnalysisProtocolError("request.familyUses");
  if (request.classifications === null) throw new AnalysisProtocolError("request.classifications");
  if (request.stintBoundaries === null) throw new AnalysisProtocolError("request.stintBoundaries");
  // An explicit classification set requires an explicit family set: omitting
  // families means the caller is unaware of that group and must not drop it.
  if ((request.classifications !== undefined || request.stintBoundaries !== undefined) && request.familyUses === undefined) throw new AnalysisProtocolError("request.familyUses");
  if (request.familyUses !== undefined && !Array.isArray(request.familyUses)) throw new AnalysisProtocolError("request.familyUses");
  if (request.classifications !== undefined && !Array.isArray(request.classifications)) throw new AnalysisProtocolError("request.classifications");
  if (request.stintBoundaries !== undefined && !Array.isArray(request.stintBoundaries)) throw new AnalysisProtocolError("request.stintBoundaries");
  // Combined quota of all four groups before traversing any request element.
  if (request.corrections.length + (request.familyUses?.length ?? 0) + (request.classifications?.length ?? 0) + (request.stintBoundaries?.length ?? 0) > 256) throw new AnalysisProtocolError("request.quota");
  parseAnalysisFamilyCorrections(request.familyUses ?? [], request.base);
  parseAnalysisClassificationCorrections(request.classifications ?? [], request.base);
  parseAnalysisStintBoundaryCorrections(request.stintBoundaries ?? [], request.base);
  for (const correction of request.corrections) {
    parseAnalysisCorrection(correction);
    if (!sameAnalysisBase(correction.base, request.base)) throw new AnalysisProtocolError("request.correctionBase");
  }
}
function matchesSaveRevision(request: AnalysisSaveRequest, revision: AnalysisRevision): boolean {
  if (!sameAnalysisBase(revision.snapshot.base, request.base)) return false;
  if (revision.command.commandId !== request.command.commandId ||
    revision.command.expectedRevision !== request.command.expectedRevision ||
    revision.command.reason !== request.command.reason ||
    revision.command.localAuthorId !== request.command.localAuthorId) return false;
  if (!sameAnalysisFamilyCorrections(request.familyUses ?? [], revision.snapshot.familyUses?.map(item => item.request) ?? [])) return false;
  if (!sameAnalysisClassificationCorrections(request.classifications ?? [], revision.snapshot.classifications?.map(item => item.request) ?? [])) return false;
  if (!sameAnalysisStintBoundaryCorrections(request.stintBoundaries ?? [], revision.snapshot.stintBoundaries?.map(item => item.request) ?? [])) return false;
  return true;
}
function parsePendingSaveRequest(value: unknown, sessionId: string, base: AnalysisBase): AnalysisSaveRequest | undefined {
  if (value === null) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AnalysisProtocolError("pending");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.familyUses) || !Array.isArray(raw.classifications) || !Array.isArray(raw.stintBoundaries) || typeof raw.commandDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.commandDigest)) {
    throw new AnalysisProtocolError("pending.complete");
  }
  const request = { sessionId, base, corrections: raw.corrections, familyUses: raw.familyUses, classifications: raw.classifications, stintBoundaries: raw.stintBoundaries, command: raw.command } as AnalysisSaveRequest;
  validateSaveRequest(request);
  return request;
}
// Stateless transport: no retries or invented empty data. Cancelling a save
// does not imply rollback; consumers must retain its command ID for recovery.
export function createAnalysisClient(transport: AnalysisTransport = createNativeAnalysisTransport()) {
  async function invoke(method: AnalysisMethod, args: readonly unknown[], signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const result = await transport.call(method, args, signal);
    signal?.throwIfAborted();
    return result;
  }
  return {
    async status(signal?: AbortSignal) {
      return parseAnalysisStatus(await invoke("Status", [], signal));
    },
    async discover(signal?: AbortSignal) {
      return parseAnalysisCandidates(await invoke("Discover", [], signal));
    },
    async selectFile(path: string, signal?: AbortSignal) {
      if (typeof path !== "string" || !path.trim()) throw new AnalysisProtocolError("request.path");
      const selected = parseAnalysisCandidates([await invoke("SelectFile", [{ path, userApproved: true }], signal)])[0];
      if (selected.state !== "ready" || selected.walPresent) throw new AnalysisProtocolError("selectFile.notReady");
      return selected;
    },
    async recoverCopy(sourceId: string, signal?: AbortSignal) {
      if (!/^[a-f0-9]{64}$/.test(sourceId)) throw new AnalysisProtocolError("request.sourceId");
      const result = await invoke("RecoverCopy", [{ sourceId, userApproved: true }], signal);
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new AnalysisProtocolError("recoverCopy.result");
      const raw = result as Record<string, unknown>;
      if (raw.code === "ready") {
        const selected = parseAnalysisCandidates([raw.candidate])[0];
        if (selected.state !== "ready" || selected.walPresent) throw new AnalysisProtocolError("recoverCopy.notReady");
        return { code: "ready" as const, candidate: selected };
      }
      if (raw.candidate !== undefined || !["original_present", "copy_changed", "copy_unavailable", "registry_failure", "not_ready", "too_large"].includes(raw.code as string)) throw new AnalysisProtocolError("recoverCopy.result");
      return { code: raw.code as "original_present" | "copy_changed" | "copy_unavailable" | "registry_failure" | "not_ready" | "too_large" };
    },
    async open(candidateId: string, userApproved: boolean, signal?: AbortSignal) {
      identifier(candidateId);
      if (typeof userApproved !== "boolean") {
        throw new AnalysisProtocolError("request.userApproved");
      }
      return parseAnalysisOpenedSession(await invoke("Open", [{ candidateId, userApproved }], signal));
    },
    async saveVerifiedCopy(sessionId: string, destinationDirectory: string, signal?: AbortSignal) {
      identifier(sessionId);
      if (typeof destinationDirectory !== "string" || !destinationDirectory.trim()) throw new AnalysisProtocolError("request.destinationDirectory");
      const result = await invoke("SaveVerifiedCopyStatus", [{ sessionId, destinationDirectory, userApproved: true }], signal);
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new AnalysisProtocolError("copy.result");
      const status = result as Record<string, unknown>;
      if (status.code !== "saved") {
        if (status.copy !== undefined || !["permission", "no_space", "registry_failure", "cleanup_failure", "failed"].includes(status.code as string)) throw new AnalysisProtocolError("copy.result");
        return { code: status.code as "permission" | "no_space" | "registry_failure" | "cleanup_failure" | "failed" };
      }
      const copy = status.copy as Record<string, unknown> | undefined;
      if (!copy || typeof copy.path !== "string" || !copy.path || typeof copy.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(copy.contentSha256) || !Number.isSafeInteger(copy.sizeBytes) || (copy.sizeBytes as number) < 0) throw new AnalysisProtocolError("copy.result");
      return { code: "saved" as const, copy: { path: copy.path, contentSha256: copy.contentSha256, sizeBytes: copy.sizeBytes as number } };
    },
    async page(request: AnalysisPageRequest, signal?: AbortSignal) {
      identifier(request.sessionId);
      identifier(request.channelId);
      if (!Number.isSafeInteger(request.start) || request.start < 0 || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 16384) {
        throw new AnalysisProtocolError("request.page");
      }
      const result = parseAnalysisPage(await invoke("ReadPage", [request], signal));
      if (result.channel_id !== request.channelId || result.start !== request.start || result.samples.length > request.limit) {
        throw new AnalysisProtocolError("page.requestMismatch");
      }
      return result;
    },
    async prepare(sessionId: string, signal?: AbortSignal) {
      identifier(sessionId);
      return parseAnalysisPreparation(await invoke("PrepareCorrections", [sessionId], signal));
    },
    async laps(request: AnalysisLapRequest, signal?: AbortSignal) {
      revisionRequest(request);
      if (!request.revisionId || !Number.isSafeInteger(request.start) || request.start < 0 || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 50) throw new AnalysisProtocolError("request.laps");
      const result = parseAnalysisLapPage(await invoke("InspectCorrectionLaps", [request], signal));
      if (!sameAnalysisBase(result.page.base, request.base) || result.revisionId !== request.revisionId || result.page.start !== request.start || result.page.laps.length > request.limit) throw new AnalysisProtocolError("laps.requestMismatch");
      return result;
    },
    async save(request: AnalysisSaveRequest, signal?: AbortSignal) {
      validateSaveRequest(request);
      const recoverable = request.familyUses !== undefined && request.classifications !== undefined && request.stintBoundaries !== undefined;
      const result = parseCorrectionStoreResult(await invoke(recoverable ? "SaveRecoverableCorrections" : "SaveCorrections", [request], signal));
      if (!matchesSaveRevision(request, result.revision)) {
        throw new AnalysisProtocolError("save.requestMismatch");
      }
      return result;
    },
    async pending(sessionId: string, base: AnalysisBase, signal?: AbortSignal) {
      identifier(sessionId);
      parseAnalysisBase(base);
      return parsePendingSaveRequest(await invoke("LoadPendingCorrectionCommand", [{ sessionId, base }], signal), sessionId, base);
    },
    async acknowledge(request: AnalysisSaveRequest, signal?: AbortSignal): Promise<void> {
      validateSaveRequest(request);
      await invoke("AcknowledgeCorrectionCommand", [{ sessionId: request.sessionId, base: request.base, commandId: request.command.commandId }], signal);
    },
    async resolve(request: AnalysisSaveRequest, signal?: AbortSignal) {
      validateSaveRequest(request);
      const result = parseAnalysisCommandResolution(await invoke("ResolveCorrectionCommand", [request], signal));
      if (result.found && !matchesSaveRevision(request, result.revision)) throw new AnalysisProtocolError("resolve.requestMismatch");
      return result;
    },
    async load(request: AnalysisRevisionRequest, signal?: AbortSignal) {
      revisionRequest(request);
      const result = parseCorrectionStoreResult(await invoke("LoadCorrection", [request], signal));
      if (!sameAnalysisBase(result.revision.snapshot.base, request.base) || result.revision.revisionId !== (request.revisionId || result.headId)) {
        throw new AnalysisProtocolError("load.requestMismatch");
      }
      return result;
    },
    async project(request: AnalysisRevisionRequest, signal?: AbortSignal) {
      revisionRequest(request);
      if (request.revisionId === "") {
        throw new AnalysisProtocolError("project.exactRevisionRequired");
      }
      const result = parseInputProjection(await invoke("ProjectCorrection", [request], signal), "analysis.projection");
      if (result.sourceRevisions?.length !== 1 || result.sourceRevisions[0].sessionId !== request.base.sessionId || result.sourceRevisions[0].revisionId !== request.revisionId) {
        throw new AnalysisProtocolError("project.requestMismatch");
      }
      return result;
    },
    async close(sessionId: string, signal?: AbortSignal): Promise<void> {
      identifier(sessionId);
      await invoke("CloseSession", [sessionId], signal);
    },
  };
}
export type AnalysisClient = ReturnType<typeof createAnalysisClient>;
