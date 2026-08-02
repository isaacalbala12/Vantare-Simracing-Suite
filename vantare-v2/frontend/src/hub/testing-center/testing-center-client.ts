import {
  decodeDiagnosticErrorEvent,
  decodeDiscardedEvent,
  decodeDraftErrorEvent,
  decodeDraftEvent,
  decodePreparedDiagnosticEvent,
  eventRequestId,
  unwrapWailsEvent,
  type PreparedReportDiagnostic,
  type ReportDraft,
  type ReportDraftFields,
  type TestingCenterModule,
} from "./contracts";

const DEFAULT_TIMEOUT_MS = 8_000;

export type TestingCenterEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

export class TestingCenterClientError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "TestingCenterClientError";
    this.code = code;
  }
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestEvent<T>(options: {
  transport: TestingCenterEventTransport;
  requestEvent: string;
  responseEvent: string;
  errorEvent: string;
  operation?: "save" | "load" | "discard";
  payload: Record<string, unknown>;
  decode: (value: unknown) => T;
  decodeError: (value: unknown) => { requestId: string; code: string; operation?: string };
  timeoutMs?: number;
}): Promise<T> {
  const id = requestId();
  return new Promise((resolve, reject) => {
    let settled = false;
    const unsubscribers: Array<() => void> = [];
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      action();
    };
    const timer = globalThis.setTimeout(
      () => finish(() => reject(new TestingCenterClientError("timeout"))),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    unsubscribers.push(
      options.transport.on(options.responseEvent, (event) => {
        const value = unwrapWailsEvent(event);
        if (eventRequestId(value) !== id) return;
        try {
          const decoded = options.decode(value);
          finish(() => resolve(decoded));
        } catch {
          finish(() => reject(new TestingCenterClientError("contract_error")));
        }
      }),
      options.transport.on(options.errorEvent, (event) => {
        const value = unwrapWailsEvent(event);
        if (eventRequestId(value) !== id) return;
        try {
          const error = options.decodeError(value);
          if (options.operation && error.operation !== options.operation) return;
          finish(() => reject(new TestingCenterClientError(error.code)));
        } catch {
          finish(() => reject(new TestingCenterClientError("contract_error")));
        }
      }),
    );
    try {
      options.transport.emit(options.requestEvent, { ...options.payload, requestId: id });
    } catch {
      finish(() => reject(new TestingCenterClientError("unavailable")));
    }
  });
}

export function createTestingCenterClient(
  transport: TestingCenterEventTransport,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  return {
    saveDraft(fields: ReportDraftFields): Promise<ReportDraft> {
      return requestEvent({
        transport,
        requestEvent: "testing-center:report-draft:save",
        responseEvent: "testing-center:report-draft:saved",
        errorEvent: "testing-center:report-draft:error",
        operation: "save",
        payload: { draft: fields },
        decode: (value) => decodeDraftEvent(value).draft,
        decodeError: decodeDraftErrorEvent,
        timeoutMs,
      });
    },
    loadDraft(): Promise<ReportDraft | null> {
      return requestEvent({
        transport,
        requestEvent: "testing-center:report-draft:load",
        responseEvent: "testing-center:report-draft:loaded",
        errorEvent: "testing-center:report-draft:error",
        operation: "load",
        payload: {},
        decode: (value) => decodeDraftEvent(value).draft,
        decodeError: decodeDraftErrorEvent,
        timeoutMs,
      }).catch((error: unknown) => {
        if (error instanceof TestingCenterClientError && error.code === "not_found") return null;
        throw error;
      });
    },
    discardDraft(): Promise<void> {
      return requestEvent({
        transport,
        requestEvent: "testing-center:report-draft:discard",
        responseEvent: "testing-center:report-draft:discarded",
        errorEvent: "testing-center:report-draft:error",
        operation: "discard",
        payload: {},
        decode: (value) => { decodeDiscardedEvent(value); },
        decodeError: decodeDraftErrorEvent,
        timeoutMs,
      });
    },
    async prepareDiagnostic(options: {
      module: TestingCenterModule;
      includeLogs: boolean;
    }): Promise<PreparedReportDiagnostic> {
      const prepared = await requestEvent({
        transport,
        requestEvent: "testing-center:diagnostic:prepare",
        responseEvent: "testing-center:diagnostic:prepared",
        errorEvent: "testing-center:diagnostic:error",
        payload: options,
        decode: (value) => decodePreparedDiagnosticEvent(value).prepared,
        decodeError: decodeDiagnosticErrorEvent,
        timeoutMs,
      });
      const digest = await globalThis.crypto?.subtle?.digest(
        "SHA-256",
        new TextEncoder().encode(prepared.preview.payload),
      );
      if (!digest) throw new TestingCenterClientError("contract_error");
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== prepared.preview.sha256) throw new TestingCenterClientError("contract_error");
      return prepared;
    },
  };
}

export type TestingCenterClient = ReturnType<typeof createTestingCenterClient>;
