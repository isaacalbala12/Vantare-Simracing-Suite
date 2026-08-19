import { Events } from "@wailsio/runtime";

export const STRATEGY_CATALOG_COMMAND_VERSION_V1 =
  "strategy.official-catalog.command.v1" as const;
export const STRATEGY_CATALOG_RESULT_VERSION_V1 =
  "strategy.official-catalog.result.v1" as const;

export type StrategyCatalogStatus = "ready" | "recovered" | "stale" | "offline";

export type StrategyCatalogCompatibilityV1 = {
  readonly simulator: string;
  readonly circuit: string;
  readonly car: string;
  readonly event: string;
};

export type StrategyCatalogEntryV1 = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly compatibility: StrategyCatalogCompatibilityV1;
  readonly packageBytes: Uint8Array;
};

export type StrategyCatalogV1 = {
  readonly sequence: number;
  readonly publishedAt: string;
  readonly keyId: string;
  readonly trustVersion: number;
  readonly entries: readonly StrategyCatalogEntryV1[];
};

export type StrategyCatalogResultV1 = {
  readonly status: StrategyCatalogStatus;
  readonly warning?: string;
  readonly catalog: StrategyCatalogV1;
};

export type StrategyCatalogErrorCode =
  | "invalid_catalog_bundle"
  | "invalid_catalog_manifest"
  | "invalid_catalog_payload"
  | "invalid_catalog_trust"
  | "catalog_unknown_key"
  | "catalog_key_out_of_window"
  | "catalog_signature_invalid"
  | "catalog_checksum_mismatch"
  | "catalog_sequence_rollback"
  | "catalog_sequence_conflict"
  | "catalog_unavailable"
  | "catalog_transport_failed";

export class StrategyCatalogError extends Error {
  readonly code: StrategyCatalogErrorCode;

  constructor(code: StrategyCatalogErrorCode, message: string) {
    super(message);
    this.name = "StrategyCatalogError";
    this.code = code;
  }
}

export interface StrategyCatalogClient {
  load(requestId: string): Promise<StrategyCatalogResultV1>;
  refresh(requestId: string): Promise<StrategyCatalogResultV1>;
  cancel(requestId: string): boolean;
  dispose(): void;
}

export type StrategyCatalogEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

const COMMAND_EVENT = "strategy:catalog:command";
const RESULT_EVENT = "strategy:catalog:result";
const ERROR_EVENT = "strategy:catalog:error";
const DEFAULT_TIMEOUT_MS = 20_000;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_ENTRIES = 128;
const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;
const MAX_CATALOG_PACKAGE_BYTES = 16 * 1024 * 1024;
const statuses = new Set<StrategyCatalogStatus>(["ready", "recovered", "stale", "offline"]);
const errorCodes = new Set<StrategyCatalogErrorCode>([
  "invalid_catalog_bundle",
  "invalid_catalog_manifest",
  "invalid_catalog_payload",
  "invalid_catalog_trust",
  "catalog_unknown_key",
  "catalog_key_out_of_window",
  "catalog_signature_invalid",
  "catalog_checksum_mismatch",
  "catalog_sequence_rollback",
  "catalog_sequence_conflict",
  "catalog_unavailable",
  "catalog_transport_failed",
]);

export function createStrategyCatalogClient(
  transport: StrategyCatalogEventTransport,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): StrategyCatalogClient {
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;

  const execute = (operation: "load" | "refresh", requestId: string) => {
    if (disposed) return Promise.reject(new Error("Strategy catalog client is disposed"));
    if (!REQUEST_ID.test(requestId)) return Promise.reject(new Error("Invalid Strategy catalog request ID"));
    if (pending.has(requestId)) return Promise.reject(new Error("Strategy catalog request is already pending"));

    return new Promise<StrategyCatalogResultV1>((resolve, reject) => {
      const unsubs: Array<() => void> = [];
      let settled = false;
      const cleanup = () => {
        globalThis.clearTimeout(timeout);
        for (const unsubscribe of unsubs) unsubscribe();
        pending.delete(requestId);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const timeout = globalThis.setTimeout(
        () => fail(new Error("Timeout waiting for Strategy catalog response")),
        timeoutMs,
      );

      try {
        unsubs.push(transport.on(RESULT_EVENT, (event) => {
          const payload = readEventPayload(event);
          if (isDifferentRequest(payload, requestId)) return;
          try {
            const result = parseResultEnvelope(payload, requestId);
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
          } catch (error) {
            fail(toError(error));
          }
        }));
        unsubs.push(transport.on(ERROR_EVENT, (event) => {
          const payload = readEventPayload(event);
          if (isDifferentRequest(payload, requestId)) return;
          try {
            fail(parsePublicError(payload, requestId));
          } catch (error) {
            fail(toError(error));
          }
        }));
        pending.set(requestId, fail);
        transport.emit(COMMAND_EVENT, {
          version: STRATEGY_CATALOG_COMMAND_VERSION_V1,
          requestId,
          operation,
        });
      } catch (error) {
        fail(toError(error));
      }
    });
  };

  return {
    load(requestId) { return execute("load", requestId); },
    refresh(requestId) { return execute("refresh", requestId); },
    cancel(requestId) {
      const fail = pending.get(requestId);
      if (!fail) return false;
      fail(new Error(`Strategy catalog request ${requestId} was cancelled`));
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fail of [...pending.values()]) {
        fail(new Error("Strategy catalog client was disposed"));
      }
    },
  };
}

export function createWailsStrategyCatalogTransport(): StrategyCatalogEventTransport {
  return {
    emit(name, payload) { Events.Emit(name, payload); },
    on(name, listener) { return Events.On(name, (event) => listener(event)); },
  };
}

export function createWailsStrategyCatalogClient(): StrategyCatalogClient {
  return createStrategyCatalogClient(createWailsStrategyCatalogTransport());
}

function parseResultEnvelope(payload: Record<string, unknown>, requestId: string): StrategyCatalogResultV1 {
  parseEnvelopeHeader(payload, requestId, true);
  exactKeys(payload, ["version", "requestId", "ok", "result"], "result envelope");
  const result = objectValue(payload.result, "result");
  if (typeof result.status !== "string" || !statuses.has(result.status as StrategyCatalogStatus)) {
    throw new Error("Invalid Strategy catalog status");
  }
  const status = result.status as StrategyCatalogStatus;
  const warning = result.warning;
  if (status === "stale" || status === "offline") {
    exactKeys(result, ["status", "warning", "catalog"], "result");
    requireString(warning, "warning");
  } else {
    exactKeys(result, ["status", "catalog"], "result");
  }
  return {
    status,
    ...(typeof warning === "string" ? { warning } : {}),
    catalog: parseCatalog(result.catalog),
  };
}

function parseCatalog(value: unknown): StrategyCatalogV1 {
  const catalog = objectValue(value, "catalog");
  exactKeys(catalog, ["sequence", "publishedAt", "keyId", "trustVersion", "entries"], "catalog");
  const sequence = positiveSafeInteger(catalog.sequence, "sequence");
  const trustVersion = positiveSafeInteger(catalog.trustVersion, "trustVersion");
  const publishedAt = requireString(catalog.publishedAt, "publishedAt");
  const keyId = safeID(catalog.keyId, "keyId");
  if (!Array.isArray(catalog.entries) || catalog.entries.length > MAX_ENTRIES) {
    throw new Error("Invalid Strategy catalog entries");
  }
  let previousID = "";
  let decodedPackageBytes = 0;
  const entries = catalog.entries.map((entry, index) => {
    const parsed = parseEntry(entry, index, MAX_CATALOG_PACKAGE_BYTES - decodedPackageBytes);
    if (parsed.entry.id <= previousID) throw new Error("Invalid Strategy catalog entry order");
    previousID = parsed.entry.id;
    decodedPackageBytes += parsed.packageSize;
    return parsed.entry;
  });
  return {
    sequence,
    publishedAt,
    keyId,
    trustVersion,
    entries,
  };
}

function parseEntry(
  value: unknown,
  index: number,
  remainingCatalogPackageBytes: number,
): { entry: StrategyCatalogEntryV1; packageSize: number } {
  const entry = objectValue(value, `entries.${index}`);
  exactKeys(entry, ["id", "title", "summary", "compatibility", "package"], `entries.${index}`);
  const compatibility = objectValue(entry.compatibility, `entries.${index}.compatibility`);
  exactKeys(
    compatibility,
    ["simulator", "circuit", "car", "event"],
    `entries.${index}.compatibility`,
  );
  const parsedEntry = {
    id: safeID(entry.id, `entries.${index}.id`),
    title: boundedString(entry.title, `entries.${index}.title`, 160),
    summary: boundedString(entry.summary, `entries.${index}.summary`, 1024),
    compatibility: {
      simulator: boundedString(compatibility.simulator, `entries.${index}.compatibility.simulator`, 128),
      circuit: boundedString(compatibility.circuit, `entries.${index}.compatibility.circuit`, 128),
      car: boundedString(compatibility.car, `entries.${index}.compatibility.car`, 128),
      event: boundedString(compatibility.event, `entries.${index}.compatibility.event`, 128),
    },
  };
  const decodedPackage = decodeCanonicalBase64(
    entry.package,
    `entries.${index}.package`,
    remainingCatalogPackageBytes,
  );
  return {
    entry: {
      ...parsedEntry,
      packageBytes: decodedPackage.bytes,
    },
    packageSize: decodedPackage.size,
  };
}

function parsePublicError(payload: Record<string, unknown>, requestId: string): StrategyCatalogError {
  parseEnvelopeHeader(payload, requestId, false);
  exactKeys(payload, ["version", "requestId", "ok", "errorCode", "message"], "error envelope");
  if (typeof payload.errorCode !== "string" || !errorCodes.has(payload.errorCode as StrategyCatalogErrorCode)) {
    throw new Error("Invalid Strategy catalog public error code");
  }
  return new StrategyCatalogError(
    payload.errorCode as StrategyCatalogErrorCode,
    requireString(payload.message, "message"),
  );
}

function parseEnvelopeHeader(payload: Record<string, unknown>, requestId: string, expectedOK: boolean): void {
  if (payload.version !== STRATEGY_CATALOG_RESULT_VERSION_V1) {
    throw new Error("Unsupported Strategy catalog result version");
  }
  if (payload.requestId !== requestId || !REQUEST_ID.test(requestId)) {
    throw new Error("Invalid Strategy catalog result request ID");
  }
  if (payload.ok !== expectedOK) throw new Error("Invalid Strategy catalog result state");
}

function isDifferentRequest(payload: Record<string, unknown>, requestId: string): boolean {
  return payload.requestId !== requestId;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  return value;
}

function boundedString(value: unknown, field: string, maxBytes: number): string {
  const text = requireString(value, field);
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  return text;
}

function safeID(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!REQUEST_ID.test(id)) throw new Error(`Invalid Strategy catalog ${field}`);
  return id;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  return value;
}

function decodeCanonicalBase64(
  value: unknown,
  field: string,
  remainingCatalogPackageBytes: number,
): { bytes: Uint8Array; size: number } {
  const encoded = requireString(value, field);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedLength = encoded.length / 4 * 3 - padding;
  if (!Number.isInteger(decodedLength) || decodedLength <= 0 || decodedLength > MAX_PACKAGE_BYTES) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  if (!isCanonicalBase64(encoded, padding)) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  if (decodedLength > remainingCatalogPackageBytes) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  let binary: string;
  try {
    binary = globalThis.atob(encoded);
  } catch {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  if (binary.length !== decodedLength) {
    throw new Error(`Invalid Strategy catalog ${field}`);
  }
  return {
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    size: decodedLength,
  };
}

function isCanonicalBase64(encoded: string, padding: number): boolean {
  const contentLength = encoded.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (base64Value(encoded.charCodeAt(index)) < 0) return false;
  }
  for (let index = contentLength; index < encoded.length; index += 1) {
    if (encoded.charCodeAt(index) !== 61) return false;
  }
  if (padding === 2 && (base64Value(encoded.charCodeAt(contentLength - 1)) & 0x0f) !== 0) return false;
  if (padding === 1 && (base64Value(encoded.charCodeAt(contentLength - 1)) & 0x03) !== 0) return false;
  return true;
}

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: unknown };
  let value = wrapped?.data;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const direct = payload as Record<string, unknown>;
    if (!("data" in direct)) return direct;
  }
  return {};
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
