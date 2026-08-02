import {
  ENGINEER_PRESENTATION_EVENT,
  ENGINEER_STATUS_EVENT,
  type EngineerPresentationStore,
} from "./engineer-presentation-store";

export type EngineerPresentationAdapter = { start(): void; stop(): void };

type PresentationStatus = {
  connected: boolean;
  presentationLifecycle: number;
};

function parsePresentationStatus(input: unknown): PresentationStatus | null {
  if (typeof input !== "object" || input === null) return null;
  const status = input as Record<string, unknown>;
  if (typeof status.connected !== "boolean") return null;
  if (
    typeof status.presentationLifecycle !== "number" ||
    !Number.isSafeInteger(status.presentationLifecycle) ||
    status.presentationLifecycle < 0
  ) {
    return null;
  }
  return {
    connected: status.connected,
    presentationLifecycle: status.presentationLifecycle,
  };
}

function createStatusConsumer(store: EngineerPresentationStore) {
  let lifecycle: number | null = null;
  return {
    consume(input: unknown) {
      const status = parsePresentationStatus(input);
      if (!status) return;
      const changed = lifecycle !== null && lifecycle !== status.presentationLifecycle;
      lifecycle = status.presentationLifecycle;
      if (!status.connected || changed) store.clear("canonical-lifecycle-boundary");
    },
    reset() {
      lifecycle = null;
    },
  };
}

export function createWailsEngineerPresentationAdapter(input: {
  store: EngineerPresentationStore;
  subscribe(event: string, listener: (data: unknown) => void): () => void;
}): EngineerPresentationAdapter {
  let unsubscribers: Array<() => void> = [];
  const status = createStatusConsumer(input.store);
  return {
    start() {
      if (unsubscribers.length > 0) return;
      unsubscribers = [
        input.subscribe(ENGINEER_PRESENTATION_EVENT, (data) => input.store.publish(data)),
        input.subscribe(ENGINEER_STATUS_EVENT, status.consume),
      ];
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      status.reset();
      input.store.clear("transport-stopped");
    },
  };
}

type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
};

export function createSseEngineerPresentationAdapter(input: {
  store: EngineerPresentationStore;
  eventSourceFactory?: (url: string) => EventSourceLike;
  url?: string;
}): EngineerPresentationAdapter {
  let source: EventSourceLike | null = null;
  const status = createStatusConsumer(input.store);
  const factory = input.eventSourceFactory ?? ((url) => new EventSource(url));
  return {
    start() {
      if (source) return;
      source = factory(input.url ?? "/engineer/stream");
      source.addEventListener("engineer-notification", (event) => {
        try {
          input.store.publish(JSON.parse(event.data));
        } catch {
          // Invalid JSON is rejected without replacing the last valid product presentation.
        }
      });
      source.addEventListener("engineer-status", (event) => {
        try {
          status.consume(JSON.parse(event.data));
        } catch {
          // Malformed status cannot replace or clear a valid presentation.
        }
      });
      source.onerror = () => input.store.clear("sse-reconnect");
    },
    stop() {
      source?.close();
      source = null;
      status.reset();
      input.store.clear("transport-stopped");
    },
  };
}
