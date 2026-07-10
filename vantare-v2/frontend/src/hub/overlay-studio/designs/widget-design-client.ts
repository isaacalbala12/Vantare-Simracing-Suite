import { Events } from "@wailsio/runtime";
import type { CoreWidgetType } from "../../../overlay/core/profile-document";
import { validateWidgetDesign, type WidgetDesignV1 } from "../../../overlay/core/widget-design";
import type { StudioEventTransport } from "../state/studio-profile-client";

export interface WidgetDesignClient {
  list(widgetType?: CoreWidgetType): Promise<WidgetDesignV1[]>;
  save(design: WidgetDesignV1): Promise<WidgetDesignV1>;
  delete(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
}

const LIST_REQUEST_EVENT = "design:list";
const LIST_RESPONSE_EVENT = "design:list:response";
const SAVE_REQUEST_EVENT = "design:save";
const SAVED_EVENT = "design:saved";
const DELETE_REQUEST_EVENT = "design:delete";
const DELETED_EVENT = "design:deleted";
const RENAME_REQUEST_EVENT = "design:rename";
const RENAMED_EVENT = "design:renamed";
const ERROR_EVENT = "design:error";

const REQUEST_TIMEOUT_MS = 10_000;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `design-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
          if (data.requestId !== undefined && data.requestId !== requestId) {
            return;
          }
          handler.onMatch(data, controls);
        }),
      );
    }
  });
}

function awaitTerminalDesignEvent(
  transport: StudioEventTransport,
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
          handler.onMatch(readEventPayload(payload), controls);
        }),
      );
    }
  });
}

function readDesignList(data: Record<string, unknown>): WidgetDesignV1[] {
  const raw = data.designs;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => validateWidgetDesign(entry));
}

function readSavedDesign(data: Record<string, unknown>): WidgetDesignV1 {
  return validateWidgetDesign(data.design);
}

export function createWidgetDesignClient(transport: StudioEventTransport): WidgetDesignClient {
  return {
    list(widgetType) {
      const requestId = createRequestId();
      const pending = awaitCorrelatedEvent(
        transport,
        requestId,
        [
          {
            event: LIST_RESPONSE_EVENT,
            onMatch: (data, { resolve, cleanup }) => {
              cleanup();
              resolve(readDesignList(data));
            },
          },
          {
            event: ERROR_EVENT,
            onMatch: (data, { reject, cleanup }) => {
              if (data.operation !== "list") {
                return;
              }
              cleanup();
              reject(new Error(String(data.message ?? "design list failed")));
            },
          },
        ],
        "Timeout waiting for design list response",
      ) as Promise<WidgetDesignV1[]>;
      transport.emit(LIST_REQUEST_EVENT, {
        requestId,
        ...(widgetType ? { widgetType } : {}),
      });
      return pending;
    },

    save(design) {
      const expectedId = design.id.trim() === "" ? undefined : design.id;
      const pending = awaitTerminalDesignEvent(
        transport,
        [
          {
            event: SAVED_EVENT,
            onMatch: (data, { resolve, cleanup }) => {
              const saved = readSavedDesign(data);
              if (expectedId && saved.id !== expectedId) {
                return;
              }
              cleanup();
              resolve(saved);
            },
          },
          {
            event: ERROR_EVENT,
            onMatch: (data, { reject, cleanup }) => {
              if (data.operation !== "save") {
                return;
              }
              cleanup();
              reject(new Error(String(data.message ?? "design save failed")));
            },
          },
        ],
        "Timeout waiting for design save response",
      ) as Promise<WidgetDesignV1>;
      transport.emit(SAVE_REQUEST_EVENT, { design });
      return pending;
    },

    delete(id) {
      const pending = awaitTerminalDesignEvent(
        transport,
        [
          {
            event: DELETED_EVENT,
            onMatch: (data, { resolve, cleanup }) => {
              if (data.id !== id) {
                return;
              }
              cleanup();
              resolve(undefined);
            },
          },
          {
            event: ERROR_EVENT,
            onMatch: (data, { reject, cleanup }) => {
              if (data.operation !== "delete") {
                return;
              }
              cleanup();
              reject(new Error(String(data.message ?? "design delete failed")));
            },
          },
        ],
        "Timeout waiting for design delete response",
      ) as Promise<void>;
      transport.emit(DELETE_REQUEST_EVENT, { id });
      return pending;
    },

    rename(id, name) {
      const pending = awaitTerminalDesignEvent(
        transport,
        [
          {
            event: RENAMED_EVENT,
            onMatch: (data, { resolve, cleanup }) => {
              if (data.id !== id) {
                return;
              }
              cleanup();
              resolve(undefined);
            },
          },
          {
            event: ERROR_EVENT,
            onMatch: (data, { reject, cleanup }) => {
              if (data.operation !== "rename") {
                return;
              }
              cleanup();
              reject(new Error(String(data.message ?? "design rename failed")));
            },
          },
        ],
        "Timeout waiting for design rename response",
      ) as Promise<void>;
      transport.emit(RENAME_REQUEST_EVENT, { id, name });
      return pending;
    },
  };
}

export function createWailsWidgetDesignClient(): WidgetDesignClient {
  const transport: StudioEventTransport = {
    emit(name, payload) {
      Events.Emit(name, payload);
    },
    on(name, listener) {
      return Events.On(name, (event) => listener(event));
    },
  };
  return createWidgetDesignClient(transport);
}