import { eventName, type EventKind, type ProductID } from "./contracts";
import type { ProjectionTransportStore } from "./store";

export type TransportEventSource = {
  subscribe(name: string, listener: (data: unknown) => void): () => void;
};

export function attachProjectionTransport(
  store: ProjectionTransportStore,
  source: TransportEventSource,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  const product = store.getSnapshot().product;
  let active = true;
  const teardown: (() => void)[] = [];
  try {
    for (const kind of ["status", "projection", "fact"] as EventKind[]) {
      const remove = source.subscribe(eventName(product, kind), (data) => {
        if (!active) {
          return;
        }
        try {
          store.ingest(eventName(product, kind), data);
        } catch (error) {
          onError(error);
        }
      });
      teardown.push(remove);
    }
  } catch (error) {
    active = false;
    try {
      cleanupAll(teardown);
    } catch {
      // The subscribe failure is the actionable root cause.
    }
    throw error;
  }
  return () => {
    if (!active) {
      return;
    }
    active = false;
    cleanupAll(teardown);
  };
}

export function subscribedEventNames(product: ProductID): readonly string[] {
  return [
    eventName(product, "status"),
    eventName(product, "projection"),
    eventName(product, "fact"),
  ];
}

function cleanupAll(teardown: readonly (() => void)[]): void {
  let firstError: unknown;
  for (const remove of teardown) {
    try {
      remove();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) {
    throw firstError;
  }
}
