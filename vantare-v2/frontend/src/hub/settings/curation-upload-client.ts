import { Events } from "@wailsio/runtime";

const PROTOCOL = "curation.upload.v1" as const;
const COMMAND_EVENT = "curation:upload:command";
const RESULT_EVENT = "curation:upload:result";
const ERROR_EVENT = "curation:upload:error";

export type CurationQueueState = "pending" | "sent" | "failed" | "paused";

export interface CurationQueueItem {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: CurationQueueState;
  readonly attempts: number;
  readonly lastError?: string;
  readonly acceptedAt?: string;
  readonly semanticDigest?: string;
  readonly bundle: {
    readonly admin: { readonly uploadId: string; readonly deleteHash: string };
    readonly payload: Record<string, unknown>;
  };
}

export interface CurationUploadSnapshot {
  readonly consent: { readonly textVersion: string; readonly acceptedAt: string; readonly revokedAt?: string; readonly active: boolean };
  readonly paused: boolean;
  readonly enabled: boolean;
  readonly queue: readonly CurationQueueItem[];
  readonly deletions: readonly {
    readonly requestedAt: string;
    readonly state: "accepted" | "failed";
    readonly tombstoneRef?: string;
    readonly applyWithinDays?: number;
    readonly lastError?: string;
  }[];
}

export type CurationUploadOperation = "snapshot" | "opt_in" | "pause" | "resume" | "revoke" | "dispatch" | "delete_remote";

export interface CurationUploadTransport {
  on(name: string, handler: (event: unknown) => void): () => void;
  emit(name: string, payload: unknown): unknown;
}

export class CurationUploadClientError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "CurationUploadClientError";
    this.code = code;
  }
}

function defaultTransport(): CurationUploadTransport {
  return {
    on: (name, handler) => Events.On(name, handler as never),
    emit: (name, payload) => Events.Emit(name, payload),
  };
}

export function createCurationUploadClient(transport: CurationUploadTransport = defaultTransport()) {
  const request = (operation: CurationUploadOperation, textVersion?: string): Promise<CurationUploadSnapshot> =>
    new Promise((resolve, reject) => {
      const commandId = `curation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        offResult();
        offError();
        callback();
      };
      const offResult = transport.on(RESULT_EVENT, (event) => {
        const value = unwrap(event);
        if (value.commandId !== commandId) return;
        try {
          if (value.protocolVersion !== PROTOCOL) throw new Error("protocol");
          const snapshot = parseSnapshot(value.snapshot);
          finish(() => resolve(snapshot));
        } catch {
          finish(() => reject(new CurationUploadClientError("contract_error")));
        }
      });
      const offError = transport.on(ERROR_EVENT, (event) => {
        const value = unwrap(event);
        if (value.commandId !== commandId) return;
        finish(() => reject(new CurationUploadClientError(typeof value.code === "string" ? value.code : "contract_error", typeof value.message === "string" ? value.message : "")));
      });
      const timer = window.setTimeout(() => finish(() => reject(new CurationUploadClientError("timeout"))), 5_000);
      try {
        transport.emit(COMMAND_EVENT, { protocolVersion: PROTOCOL, commandId, operation, ...(textVersion ? { textVersion } : {}) });
      } catch {
        finish(() => reject(new CurationUploadClientError("unavailable")));
      }
    });

  return {
    snapshot: () => request("snapshot"),
    optIn: (textVersion: string) => request("opt_in", textVersion),
    pause: () => request("pause"),
    resume: () => request("resume"),
    revoke: () => request("revoke"),
    dispatch: () => request("dispatch"),
    deleteRemote: () => request("delete_remote"),
  };
}

function parseSnapshot(value: unknown): CurationUploadSnapshot {
  const snapshot = record(value);
  const consent = record(snapshot.consent);
  if (typeof consent.textVersion !== "string" || typeof consent.acceptedAt !== "string" || typeof consent.active !== "boolean") throw new Error("consent");
  if (typeof snapshot.paused !== "boolean" || typeof snapshot.enabled !== "boolean" || !Array.isArray(snapshot.queue) || !Array.isArray(snapshot.deletions)) throw new Error("snapshot");
  const queue = snapshot.queue.map((candidate) => {
    const item = record(candidate);
    if (typeof item.id !== "string" || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string" || typeof item.attempts !== "number" || !["pending", "sent", "failed", "paused"].includes(String(item.state))) throw new Error("queue");
    const bundle = record(item.bundle);
    const admin = record(bundle.admin);
    const payload = record(bundle.payload);
    if (typeof admin.uploadId !== "string" || typeof admin.deleteHash !== "string") throw new Error("bundle");
    return { ...item, state: item.state as CurationQueueState, bundle: { admin: admin as CurationQueueItem["bundle"]["admin"], payload } } as unknown as CurationQueueItem;
  });
  const deletions = snapshot.deletions.map((candidate) => {
    const deletion = record(candidate);
    if (typeof deletion.requestedAt !== "string" || (deletion.state !== "accepted" && deletion.state !== "failed")) throw new Error("deletion");
    return deletion as unknown as CurationUploadSnapshot["deletions"][number];
  });
  return { consent: consent as unknown as CurationUploadSnapshot["consent"], paused: snapshot.paused, enabled: snapshot.enabled, queue, deletions };
}

function unwrap(event: unknown): Record<string, unknown> {
  const outer = record(event);
  return "data" in outer ? record(outer.data) : outer;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("contract");
  return value as Record<string, unknown>;
}
