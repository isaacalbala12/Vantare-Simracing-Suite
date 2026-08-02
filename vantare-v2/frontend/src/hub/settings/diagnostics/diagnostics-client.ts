import {
  DiagnosticsContractError,
  decodeDiagnosticsErrorEvent,
  decodeDiagnosticsSessionInspectEvent,
  decodeDiagnosticsSessionListEvent,
  decodePreparedDiagnosticsEvent,
  type DiagnosticsErrorCode,
  type DiagnosticsOperation,
  type DiagnosticsSession,
  type DiagnosticsSessionList,
  type PreparedDiagnostics,
} from "./contracts";
import { verifyPreparedDiagnostics } from "./prepared-integrity";

const PREPARE_REQUEST_EVENT = "diagnostics:prepare";
const PREPARED_EVENT = "diagnostics:prepared";
const LIST_REQUEST_EVENT = "diagnostics:sessions:list";
const LISTED_EVENT = "diagnostics:sessions:listed";
const INSPECT_REQUEST_EVENT = "diagnostics:sessions:inspect";
const INSPECTED_EVENT = "diagnostics:sessions:inspected";
const CANCEL_EVENT = "diagnostics:cancel";
const ERROR_EVENT = "diagnostics:error";
const DEFAULT_TIMEOUT_MS = 10_000;

export type DiagnosticsEventTransport = {
  emit(name: string, payload?: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

export type DiagnosticsClient = {
  prepare(signal?: AbortSignal): Promise<PreparedDiagnostics>;
  listSessions(options?: {
    limit?: number;
    signal?: AbortSignal;
  }): Promise<DiagnosticsSessionList>;
  inspectSession(handle: string, signal?: AbortSignal): Promise<DiagnosticsSession>;
};

export class DiagnosticsClientError extends Error {
  readonly code: DiagnosticsErrorCode;
  readonly operation: DiagnosticsOperation;

  constructor(
    code: DiagnosticsErrorCode,
    operation: DiagnosticsOperation,
    message = `${operation}: ${code}`,
  ) {
    super(message);
    this.name = "DiagnosticsClientError";
    this.code = code;
    this.operation = operation;
  }
}

type DiagnosticsClientOptions = {
  timeoutMs?: number;
  createRequestId?: () => string;
};

type RequestConfig<T> = {
  operation: DiagnosticsOperation;
  requestEvent: string;
  responseEvent: string;
  request: Record<string, unknown>;
  signal?: AbortSignal;
  decode: (payload: unknown) => { requestId: string; value: T };
};

function defaultRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function unwrapWailsPayload(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) {
      if (data.length !== 1) {
        throw new DiagnosticsContractError("Wails event data must contain exactly one payload");
      }
      return data[0];
    }
    return data;
  }
  return value;
}

function foreignRequest(payload: unknown, expectedRequestId: string): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return true;
  }
  const candidate = (payload as { requestId?: unknown }).requestId;
  return typeof candidate !== "string" || candidate !== expectedRequestId;
}

export function createDiagnosticsClient(
  transport: DiagnosticsEventTransport,
  options: DiagnosticsClientOptions = {},
): DiagnosticsClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nextRequestId = options.createRequestId ?? defaultRequestId;

  function request<T>(config: RequestConfig<T>): Promise<T> {
    if (config.signal?.aborted) {
      return Promise.reject(
        new DiagnosticsClientError("canceled", config.operation),
      );
    }
    const requestId = nextRequestId();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let requestSent = false;
      let cancelSent = false;
      const unsubscribes: Array<() => void> = [];

      const cleanup = () => {
        clearTimeout(timeout);
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
        config.signal?.removeEventListener("abort", onAbort);
      };
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        action();
      };
      const cancelBackend = () => {
        if (!requestSent || cancelSent) return;
        cancelSent = true;
        try {
          transport.emit(CANCEL_EVENT, {
            requestId,
            operation: config.operation,
          });
        } catch {
          // Local cancellation must remain deterministic even if the runtime
          // is already shutting down and cannot deliver the cancel event.
        }
      };
      const onAbort = () => {
        finish(() =>
          reject(new DiagnosticsClientError("canceled", config.operation)),
        );
        cancelBackend();
      };
      const rejectContract = (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "invalid diagnostics response";
        finish(() =>
          reject(
            new DiagnosticsClientError(
              "contract_error",
              config.operation,
              message,
            ),
          ),
        );
      };

      const timeout = setTimeout(() => {
        finish(() =>
          reject(new DiagnosticsClientError("timeout", config.operation)),
        );
        cancelBackend();
      }, timeoutMs);
      unsubscribes.push(
        transport.on(config.responseEvent, (event) => {
          try {
            const payload = unwrapWailsPayload(event);
            if (foreignRequest(payload, requestId)) {
              return;
            }
            const response = config.decode(payload);
            finish(() => resolve(response.value));
          } catch (error) {
            rejectContract(error);
          }
        }),
        transport.on(ERROR_EVENT, (event) => {
          try {
            const payload = unwrapWailsPayload(event);
            if (foreignRequest(payload, requestId)) {
              return;
            }
            const error = decodeDiagnosticsErrorEvent(payload);
            if (error.operation !== config.operation) return;
            finish(() =>
              reject(
                new DiagnosticsClientError(error.code, config.operation),
              ),
            );
          } catch (error) {
            rejectContract(error);
          }
        }),
      );
      config.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        requestSent = true;
        transport.emit(config.requestEvent, {
          ...config.request,
          requestId,
        });
      } catch (error) {
        requestSent = false;
        rejectContract(error);
      }
    });
  }

  return {
    async prepare(signal) {
      const prepared = await request({
        operation: "prepare",
        requestEvent: PREPARE_REQUEST_EVENT,
        responseEvent: PREPARED_EVENT,
        request: {},
        signal,
        decode(payload) {
          const response = decodePreparedDiagnosticsEvent(payload);
          return { requestId: response.requestId, value: response.prepared };
        },
      });
      if (signal?.aborted) {
        throw new DiagnosticsClientError("canceled", "prepare");
      }
      try {
        await verifyPreparedDiagnostics(prepared);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid diagnostics digest";
        throw new DiagnosticsClientError("contract_error", "prepare", message);
      }
      if (signal?.aborted) {
        throw new DiagnosticsClientError("canceled", "prepare");
      }
      return prepared;
    },

    listSessions(options = {}) {
      const limit = options.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        return Promise.reject(
          new DiagnosticsClientError(
            "invalid_request",
            "sessions.list",
          ),
        );
      }
      return request({
        operation: "sessions.list",
        requestEvent: LIST_REQUEST_EVENT,
        responseEvent: LISTED_EVENT,
        request: { limit },
        signal: options.signal,
        decode(payload) {
          const response = decodeDiagnosticsSessionListEvent(payload);
          return { requestId: response.requestId, value: response.result };
        },
      });
    },

    inspectSession(handle, signal) {
      if (
        typeof handle !== "string" ||
        handle.length < 8 ||
        handle.length > 64 ||
        !/^[A-Za-z0-9_-]+$/u.test(handle)
      ) {
        return Promise.reject(
          new DiagnosticsClientError(
            "invalid_request",
            "sessions.inspect",
          ),
        );
      }
      return request({
        operation: "sessions.inspect",
        requestEvent: INSPECT_REQUEST_EVENT,
        responseEvent: INSPECTED_EVENT,
        request: { handle },
        signal,
        decode(payload) {
          const response = decodeDiagnosticsSessionInspectEvent(payload);
          if (response.session.handle !== handle) {
            throw new DiagnosticsContractError(
              "inspected session handle does not match the request",
            );
          }
          return { requestId: response.requestId, value: response.session };
        },
      });
    },
  };
}

export function isDiagnosticsClientError(
  error: unknown,
): error is DiagnosticsClientError {
  return error instanceof DiagnosticsClientError;
}
