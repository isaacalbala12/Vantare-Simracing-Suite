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

const ACTIVE_PULL_DELAY_MS = 16;
const IDLE_PULL_DELAY_MS = 100;
const ERROR_PULL_DELAY_MS = 250;
const EMPTY_RESPONSES_BEFORE_IDLE = 3;
const BROWSER_PULL_TIMEOUT_MS = 5_000;

export type OverlayWailsPullOptions = Readonly<{
  post(route: string, data: unknown): unknown | Promise<unknown>;
  schedule?: (callback: () => void, delayMs: number) => ScheduleHandle;
  cancel?: (handle: ScheduleHandle) => void;
  createSessionID?: () => string;
  onError?: (error: unknown) => void;
  now?: () => number;
}>;

export type OverlayWailsPullDiagnostics = Readonly<{
  active: boolean;
  requestsCompleted: number;
  receivedV1Projections: number;
  receivedV2Snapshots: number;
  requestDurationMs: Readonly<{ count: number; mean: number; max: number }>;
}>;

export type OverlayWailsPullClient = Readonly<{
  source: Readonly<{
    subscribe(name: string, listener: (data: unknown) => void): () => void;
  }>;
  start(): void;
  stop(): void;
  getDiagnostics(): OverlayWailsPullDiagnostics;
}>;

export type BrowserOverlayWailsPullOptions = Readonly<{
  onError?: (error: unknown) => void;
}>;

let sessionSequence = 0;

function defaultSessionID(): string {
  sessionSequence += 1;
  return `overlay-${Date.now().toString(36)}-${sessionSequence.toString(36)}`;
}

function defaultSchedule(callback: () => void, delayMs: number): ScheduleHandle {
  return setTimeout(callback, delayMs);
}

function defaultCancel(handle: ScheduleHandle): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

export function createOverlayWailsPullClient(
  options: OverlayWailsPullOptions,
): OverlayWailsPullClient {
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? defaultCancel;
  const createSessionID = options.createSessionID ?? defaultSessionID;
  const onError = options.onError ?? (() => undefined);
  const now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  let active = false;
  let awaiting = false;
  let sessionID = "";
  let acknowledged = 0;
  let emptyResponses = 0;
  let scheduled: ScheduleHandle | undefined;
  let requestsCompleted = 0;
  let receivedV1Projections = 0;
  let receivedV2Snapshots = 0;
  let requestDurationTotalMs = 0;
  let requestDurationMaxMs = 0;

  const scheduleNext = (delayMs: number) => {
    if (!active || scheduled !== undefined) return;
    scheduled = schedule(request, delayMs);
  };

  const handlePostedResponse = (
    input: unknown,
    requestSessionID: string,
    requestAck: number,
    startedAt: number,
  ) => {
    if (!active || sessionID !== requestSessionID || acknowledged !== requestAck) return;
    const duration = Math.max(0, now() - startedAt);
    requestsCompleted += 1;
    requestDurationTotalMs += duration;
    requestDurationMaxMs = Math.max(requestDurationMaxMs, duration);
    if (input === undefined) {
      awaiting = false;
      emptyResponses += 1;
      scheduleNext(
        emptyResponses >= EMPTY_RESPONSES_BEFORE_IDLE
          ? IDLE_PULL_DELAY_MS
          : ACTIVE_PULL_DELAY_MS,
      );
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
    const startedAt = now();
    try {
      const posted = options.post(OVERLAY_PULL_REQUEST_ROUTE, {
        sessionId: requestSessionID,
        ack: requestAck,
      });
      if (posted instanceof Promise) {
        void posted.then(
          (input) => handlePostedResponse(input, requestSessionID, requestAck, startedAt),
          (error) => {
            if (active && sessionID === requestSessionID && acknowledged === requestAck) {
              awaiting = false;
              scheduleNext(ERROR_PULL_DELAY_MS);
            }
            onError(error);
          },
        );
      } else {
        handlePostedResponse(posted, requestSessionID, requestAck, startedAt);
      }
    } catch (error) {
      awaiting = false;
      scheduleNext(ERROR_PULL_DELAY_MS);
      onError(error);
    }
  };

  const handleResponse = (input: unknown) => {
    const response = decodeResponse(input);
    if (!response) {
      awaiting = false;
      scheduleNext(ERROR_PULL_DELAY_MS);
      onError(new Error("overlay-wails-pull:invalid-response"));
      return;
    }
    if (!active) return;
    if (!awaiting || response.sessionId !== sessionID || response.delivery !== acknowledged + 1) {
      awaiting = false;
      scheduleNext(ERROR_PULL_DELAY_MS);
      onError(new Error("overlay-wails-pull:unexpected-response"));
      return;
    }

    awaiting = false;
    for (const event of response.events) {
      if (!ALLOWED_EVENTS.has(event.name)) {
        onError(new Error("overlay-wails-pull:invalid-event-name"));
        continue;
      }
      if (event.name === "telemetry:overlay:projection") receivedV1Projections += 1;
      if (event.name === "telemetry:overlay-v2:snapshot") receivedV2Snapshots += 1;
      for (const listener of listeners.get(event.name) ?? []) {
        try {
          listener(event.data);
        } catch (error) {
          onError(error);
        }
      }
    }
    acknowledged = response.delivery;
    emptyResponses = response.events.length === 0 ? emptyResponses + 1 : 0;
    scheduleNext(
      emptyResponses >= EMPTY_RESPONSES_BEFORE_IDLE
        ? IDLE_PULL_DELAY_MS
        : ACTIVE_PULL_DELAY_MS,
    );
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
      emptyResponses = 0;
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
    getDiagnostics() {
      return Object.freeze({
        active,
        requestsCompleted,
        receivedV1Projections,
        receivedV2Snapshots,
        requestDurationMs: Object.freeze({
          count: requestsCompleted,
          mean: requestsCompleted === 0 ? 0 : requestDurationTotalMs / requestsCompleted,
          max: requestDurationMaxMs,
        }),
      });
    },
  };
}

export function createBrowserOverlayWailsPullClient(
  options: BrowserOverlayWailsPullOptions = {},
): OverlayWailsPullClient {
  return createOverlayWailsPullClient({
    post: async (route, data) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BROWSER_PULL_TIMEOUT_MS);
      try {
        const response = await fetch(route, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(data),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`overlay telemetry pull HTTP ${response.status}`);
        }
        if (response.status === 204) return undefined;
        return response.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    onError: options.onError,
  });
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
