import { useSyncExternalStore } from "react";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

export type TelemetryStore = {
  getSnapshot(): TelemetrySnapshot;
  subscribe(listener: () => void): () => void;
  publish(snapshot: TelemetrySnapshot): void;
};

function cloneSnapshot(snapshot: TelemetrySnapshot): TelemetrySnapshot {
  return {
    ...snapshot,
    session: { ...snapshot.session },
    player: { ...snapshot.player },
    scoring: snapshot.scoring.map((entry) => ({ ...entry })),
  };
}

export function createTelemetryStore(initial: TelemetrySnapshot): TelemetryStore {
  let snapshot = cloneSnapshot(initial);
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next) {
      snapshot = cloneSnapshot(next);
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export function useTelemetrySnapshot(store: TelemetryStore): TelemetrySnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}