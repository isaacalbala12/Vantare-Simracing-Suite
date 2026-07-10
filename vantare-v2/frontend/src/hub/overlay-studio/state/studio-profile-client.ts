import { Events } from "@wailsio/runtime";
import {
  parseProfileDocumentV3,
  type LoadedProfileDocumentV3,
  type ProfileDocumentV3,
} from "../../../overlay/core/profile-document";

export type StudioSaveResult =
  | { status: "saved"; document: ProfileDocumentV3; revision: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export interface StudioProfileClient {
  load(file: string): Promise<LoadedProfileDocumentV3>;
  save(input: { document: ProfileDocumentV3; expectedRevision: string }): Promise<StudioSaveResult>;
}

export type StudioEventTransport = {
  emit(name: string, payload?: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

const LOAD_REQUEST_EVENT = "studio:profile:load";
const SAVE_REQUEST_EVENT = "studio:profile:save";
const LOADED_EVENT = "studio:profile:loaded";
const SAVED_EVENT = "studio:profile:saved";
const CONFLICT_EVENT = "studio:profile:conflict";
const ERROR_EVENT = "studio:profile:error";

const REQUEST_TIMEOUT_MS = 10_000;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `studio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: Record<string, unknown> };
  if (wrapped?.data && typeof wrapped.data === "object") {
    return wrapped.data;
  }
  if (payload && typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  return {};
}

function readMigratedFrom(value: unknown): LoadedProfileDocumentV3["migratedFrom"] {
  if (value === 0 || value === 2 || value === 3) {
    return value;
  }
  return undefined;
}

type CorrelatedHandler = {
  event: string;
  onMatch: (
    data: Record<string, unknown>,
    controls: { resolve: <T>(value: T) => void; reject: (error: Error) => void; cleanup: () => void },
  ) => void;
};

function awaitCorrelatedEvent(
  transport: StudioEventTransport,
  requestId: string,
  handlers: CorrelatedHandler[],
  timeoutMessage: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const unsubs: Array<() => void> = [];
    const cleanup = () => {
      window.clearTimeout(timeout);
      for (const unsub of unsubs) {
        unsub();
      }
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, REQUEST_TIMEOUT_MS);

    const controls = {
      resolve,
      reject,
      cleanup,
    };

    for (const handler of handlers) {
      unsubs.push(
        transport.on(handler.event, (payload) => {
          const data = readEventPayload(payload);
          if (data.requestId !== requestId) {
            return;
          }
          handler.onMatch(data, controls);
        }),
      );
    }
  });
}

export function createStudioProfileClient(transport: StudioEventTransport): StudioProfileClient {
  return {
    load(file) {
      const requestId = createRequestId();
      const pending = awaitCorrelatedEvent(transport, requestId, [
        {
          event: LOADED_EVENT,
          onMatch: (data, { resolve, cleanup }) => {
            cleanup();
            resolve({
              document: parseProfileDocumentV3(data.document),
              revision: String(data.revision ?? ""),
              migratedFrom: readMigratedFrom(data.migratedFrom),
            } satisfies LoadedProfileDocumentV3);
          },
        },
        {
          event: ERROR_EVENT,
          onMatch: (data, { reject, cleanup }) => {
            cleanup();
            reject(new Error(String(data.message ?? "studio profile load failed")));
          },
        },
      ], "Timeout waiting for studio profile load response") as Promise<LoadedProfileDocumentV3>;
      transport.emit(LOAD_REQUEST_EVENT, { file, requestId });
      return pending;
    },

    save(input) {
      const requestId = createRequestId();
      const pending = awaitCorrelatedEvent(transport, requestId, [
        {
          event: SAVED_EVENT,
          onMatch: (data, { resolve, cleanup }) => {
            cleanup();
            resolve({
              status: "saved",
              document: parseProfileDocumentV3(data.document),
              revision: String(data.revision ?? ""),
            });
          },
        },
        {
          event: CONFLICT_EVENT,
          onMatch: (data, { resolve, cleanup }) => {
            cleanup();
            resolve({
              status: "conflict",
              message: String(data.message ?? "profile save conflict"),
            } satisfies StudioSaveResult);
          },
        },
        {
          event: ERROR_EVENT,
          onMatch: (data, { resolve, cleanup }) => {
            cleanup();
            resolve({
              status: "error",
              message: String(data.message ?? "profile save failed"),
            } satisfies StudioSaveResult);
          },
        },
      ], "Timeout waiting for studio profile save response") as Promise<StudioSaveResult>;
      transport.emit(SAVE_REQUEST_EVENT, {
        document: input.document,
        expectedRevision: input.expectedRevision,
        requestId,
      });
      return pending;
    },
  };
}

export function createWailsStudioEventTransport(): StudioEventTransport {
  return {
    emit(name, payload) {
      Events.Emit(name, payload);
    },
    on(name, listener) {
      return Events.On(name, (event) => listener(event));
    },
  };
}