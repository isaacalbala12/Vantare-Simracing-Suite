import {
  ENGINEER_STREAM_EVENT,
  type EngineerPresentationStore,
} from "./engineer-presentation-store";

export type EngineerPresentationAdapter = { start(): void; stop(): void };

export function createWailsEngineerPresentationAdapter(input: {
  store: EngineerPresentationStore;
  subscribe(event: string, listener: (data: unknown) => void): () => void;
  requestSnapshot?: () => void;
}): EngineerPresentationAdapter {
  let unsubscribers: Array<() => void> = [];
  return {
    start() {
      if (unsubscribers.length > 0) return;
      unsubscribers = [input.subscribe(ENGINEER_STREAM_EVENT, (data) => input.store.consumeStream(data))];
      input.requestSnapshot?.();
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      input.store.resetTransport();
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
  const factory = input.eventSourceFactory ?? ((url) => new EventSource(url));
  return {
    start() {
      if (source) return;
      source = factory(input.url ?? "/engineer/stream");
      source.addEventListener("engineer-stream", (event) => {
        try {
          input.store.consumeStream(JSON.parse(event.data));
        } catch {
          // Invalid JSON is rejected without replacing the last ordered snapshot.
        }
      });
      source.onerror = () => input.store.resetTransport();
    },
    stop() {
      source?.close();
      source = null;
      input.store.resetTransport();
    },
  };
}
