import { Events } from "@wailsio/runtime";
import type { LauncherSnapshot } from "./launcher-contract";

export type SnapshotListener = (snapshot: LauncherSnapshot) => void;
export type Unsubscribe = () => void;

export type LauncherBridgeLike = {
  subscribeSnapshot: (listener: SnapshotListener) => Unsubscribe;
  requestSnapshot: () => void;
  dispatchLauncherCommand: (name: string, payload?: unknown) => void;
};

const snapshotListeners = new Set<SnapshotListener>();
let wailsUnsubscribe: Unsubscribe | null = null;

function handleSnapshotEvent(event: unknown) {
  const snapshot = (event as { data?: LauncherSnapshot } | undefined)?.data;
  if (!snapshot) return;
  snapshotListeners.forEach((listener) => listener(snapshot));
}

function ensureSnapshotListener() {
  if (wailsUnsubscribe) return;
  wailsUnsubscribe = Events.On("launcher:snapshot", handleSnapshotEvent);
}

export function subscribeSnapshot(listener: SnapshotListener): Unsubscribe {
  ensureSnapshotListener();
  snapshotListeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    snapshotListeners.delete(listener);
    if (snapshotListeners.size === 0) {
      wailsUnsubscribe?.();
      wailsUnsubscribe = null;
    }
  };
}

export function requestSnapshot(): void {
  Events.Emit("launcher:snapshot:get");
}

export function dispatchLauncherCommand(name: string, payload?: unknown): void {
  if (payload === undefined) {
    Events.Emit(name);
    return;
  }
  Events.Emit(name, payload);
}
