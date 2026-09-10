import { Call } from "@wailsio/runtime";
import { parseInputProjection } from "./strategy-application-client";
import { AnalysisProtocolError, parseAnalysisBase, parseAnalysisCandidates, parseAnalysisCommandResolution, parseAnalysisCorrection, parseAnalysisOpenedSession, parseAnalysisPage, parseAnalysisPreparation, parseAnalysisSaveCommand, parseAnalysisStatus, parseCorrectionStoreResult, sameAnalysisBase, type AnalysisBase, type AnalysisCorrection, type AnalysisSaveCommand } from "./analysis-contract";
const methods = ["Status", "Discover", "Open", "ReadPage", "PrepareCorrections", "SaveCorrections", "ResolveCorrectionCommand", "LoadCorrection", "ProjectCorrection", "CloseSession"] as const;
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
  command: AnalysisSaveCommand;
}>;
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
  if (!Array.isArray(request.corrections) || request.corrections.length > 256) throw new AnalysisProtocolError("request.corrections");
  for (const correction of request.corrections) {
    parseAnalysisCorrection(correction);
    if (!sameAnalysisBase(correction.base, request.base)) throw new AnalysisProtocolError("request.correctionBase");
  }
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
    async open(candidateId: string, userApproved: boolean, signal?: AbortSignal) {
      identifier(candidateId);
      if (typeof userApproved !== "boolean") {
        throw new AnalysisProtocolError("request.userApproved");
      }
      return parseAnalysisOpenedSession(await invoke("Open", [{ candidateId, userApproved }], signal));
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
    async save(request: AnalysisSaveRequest, signal?: AbortSignal) {
      validateSaveRequest(request);
      const result = parseCorrectionStoreResult(await invoke("SaveCorrections", [request], signal));
      if (!sameAnalysisBase(result.revision.snapshot.base, request.base) || result.revision.command.commandId !== request.command.commandId) {
        throw new AnalysisProtocolError("save.requestMismatch");
      }
      return result;
    },
    async resolve(request: AnalysisSaveRequest, signal?: AbortSignal) {
      validateSaveRequest(request);
      const result = parseAnalysisCommandResolution(await invoke("ResolveCorrectionCommand", [request], signal));
      if (result.found && (!sameAnalysisBase(result.revision.snapshot.base, request.base) ||
        result.revision.command.commandId !== request.command.commandId ||
        result.revision.command.expectedRevision !== request.command.expectedRevision ||
        result.revision.command.reason !== request.command.reason ||
        result.revision.command.localAuthorId !== request.command.localAuthorId)) throw new AnalysisProtocolError("resolve.requestMismatch");
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
