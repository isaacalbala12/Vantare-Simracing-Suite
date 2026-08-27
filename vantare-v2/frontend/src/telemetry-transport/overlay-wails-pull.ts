export const OVERLAY_PULL_REQUEST_ROUTE = "/_vantare/overlay-telemetry/pull";
export const OVERLAY_PULL_CLOSE_ROUTE = "/_vantare/overlay-telemetry/close";

const MAX_SESSION_ID_LENGTH = 128;

const ALLOWED_EVENTS = new Set([
  "telemetry:overlay:status",
  "telemetry:overlay:projection",
  "telemetry:overlay:fact",
  "telemetry:overlay-v2:status",
  "telemetry:overlay-v2:snapshot",
]);

type PullEvent = Readonly<{name: string; data: unknown}>;
type PullResponse = Readonly<{
  sessionId: string;
  delivery: number;
  events: readonly PullEvent[];
}>;

type ScheduleHandle = unknown;

export type OverlayWailsPullOptions = Readonly<{
  post(route: string, data: unknown): unknown | Promise<unknown>;
  schedule?: (callback: () => void) => ScheduleHandle;
  cancel?: (handle: ScheduleHandle) => void;
  createSessionID?: () => string;
  onError?: (error: unknown) => void;
}>;

export type OverlayWailsPullClient = Readonly<{
  source: Readonly<{
    subscribe(name: string, listener: (data: unknown) => void): () => void;
  }>;
  start(): void;
  stop(): void;
}>;

let sessionSequence = 0;

function defaultSessionID(): string {
  sessionSequence += 1;
  return `overlay-${Date.now().toString(36)}-${sessionSequence.toString(36)}`;
}

function defaultSchedule(callback: () => void): ScheduleHandle {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
}

function defaultCancel(handle: ScheduleHandle): void {
  if (typeof cancelAnimationFrame === "function" && typeof handle === "number") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

export function createOverlayWailsPullClient(
  options: OverlayWailsPullOptions,
): OverlayWailsPullClient {
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? defaultCancel;
  const createSessionID = options.createSessionID ?? defaultSessionID;
  const onError = options.onError ?? (() => undefined);
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  let active = false;
  let awaiting = false;
  let sessionID = "";
  let acknowledged = 0;
  let scheduled: ScheduleHandle | undefined;

  const scheduleNext = () => {
    if (!active || scheduled !== undefined) return;
    scheduled = schedule(request);
  };

  const handlePostedResponse = (
    input: unknown,
    requestSessionID: string,
    requestAck: number,
  ) => {
    if (!active || sessionID !== requestSessionID || acknowledged !== requestAck) return;
    if (input === undefined) {
      awaiting = false;
      scheduleNext();
      return;
    }
    handleResponse(input);
  };

  const request = () => {
    scheduled = undefined;
    if (!active || awaiting) return;
    awaiting = true;
    const requestSessionID = sessionID;
    const requestAck = acknowledged;
    try {
      const posted = options.post(OVERLAY_PULL_REQUEST_ROUTE, {
        sessionId: requestSessionID,
        ack: requestAck,
      });
      if (posted instanceof Promise) {
        void posted.then(
          (input) => handlePostedResponse(input, requestSessionID, requestAck),
          (error) => {
            if (active && sessionID === requestSessionID && acknowledged === requestAck) {
              awaiting = false;
            }
            onError(error);
          },
        );
      } else {
        handlePostedResponse(posted, requestSessionID, requestAck);
      }
    } catch (error) {
      awaiting = false;
      onError(error);
    }
  };

  const handleResponse = (input: unknown) => {
    const response = decodeResponse(input);
    if (!response) {
      onError(new Error("overlay-wails-pull:invalid-response"));
      return;
    }
    if (!active || response.sessionId !== sessionID) return;
    if (!awaiting || response.delivery !== acknowledged + 1) return;

    awaiting = false;
    for (const event of response.events) {
      if (!ALLOWED_EVENTS.has(event.name)) {
        onError(new Error("overlay-wails-pull:invalid-event-name"));
        continue;
      }
      for (const listener of listeners.get(event.name) ?? []) {
        try {
          listener(event.data);
        } catch (error) {
          onError(error);
        }
      }
    }
    acknowledged = response.delivery;
    scheduleNext();
  };

  return {
    source: {
      subscribe(name, listener) {
        let eventListeners = listeners.get(name);
        if (!eventListeners) {
          eventListeners = new Set();
          listeners.set(name, eventListeners);
        }
        eventListeners.add(listener);
        return () => {
          eventListeners?.delete(listener);
          if (eventListeners?.size === 0) listeners.delete(name);
        };
      },
    },
    start() {
      if (active) return;
      active = true;
      awaiting = false;
      acknowledged = 0;
      sessionID = createSessionID();
      request();
    },
    stop() {
      if (!active) return;
      active = false;
      awaiting = false;
      if (scheduled !== undefined) {
        cancel(scheduled);
        scheduled = undefined;
      }
      try {
        const posted = options.post(OVERLAY_PULL_CLOSE_ROUTE, {
          sessionId: sessionID,
          ack: acknowledged,
        });
        void Promise.resolve(posted).catch(onError);
      } catch (error) {
        onError(error);
      }
    },
  };
}

function decodeResponse(input: unknown): PullResponse | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (
    typeof value.sessionId !== "string" || value.sessionId.length === 0 ||
    value.sessionId.length > MAX_SESSION_ID_LENGTH ||
    !Number.isSafeInteger(value.delivery) || (value.delivery as number) <= 0 ||
    !Array.isArray(value.events)
  ) {
    return undefined;
  }
  const events: PullEvent[] = [];
  for (const inputEvent of value.events) {
    if (inputEvent === null || typeof inputEvent !== "object" || Array.isArray(inputEvent)) {
      return undefined;
    }
    const event = inputEvent as Record<string, unknown>;
    if (typeof event.name !== "string" || !("data" in event)) return undefined;
    events.push({name: event.name, data: event.data});
  }
  return {sessionId: value.sessionId, delivery: value.delivery as number, events};
}
