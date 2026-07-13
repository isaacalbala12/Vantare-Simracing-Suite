import { Events } from "@wailsio/runtime";
import type { LauncherDiscoveryProgress, LauncherSnapshot } from "./launcher-contract";

export type SnapshotListener = (snapshot: LauncherSnapshot) => void;
export type DiscoveryProgressListener = (progress: LauncherDiscoveryProgress) => void;
export type Unsubscribe = () => void;

export type LauncherBridgeLike = {
  subscribeSnapshot: (listener: SnapshotListener) => Unsubscribe;
  subscribeDiscoveryProgress?: (listener: DiscoveryProgressListener) => Unsubscribe;
  requestSnapshot: () => void;
  dispatchLauncherCommand: (name: string, payload?: unknown) => void;
};

const snapshotListeners = new Set<SnapshotListener>();
const progressListeners = new Set<DiscoveryProgressListener>();
let wailsUnsubscribe: Unsubscribe | null = null;
let wailsProgressUnsubscribe: Unsubscribe | null = null;

function handleSnapshotEvent(event: unknown) {
  const snapshot = (event as { data?: LauncherSnapshot } | undefined)?.data;
  if (!snapshot) return;
  snapshotListeners.forEach((listener) => listener(snapshot));
}

function ensureSnapshotListener() {
  if (wailsUnsubscribe) return;
  wailsUnsubscribe = Events.On("launcher:snapshot", handleSnapshotEvent);
}
function ensureProgressListener() {
  if (wailsProgressUnsubscribe) return;
  wailsProgressUnsubscribe = Events.On("launcher:discovery:progress", (event: unknown) => {
    const progress = (event as { data?: LauncherDiscoveryProgress } | undefined)?.data;
    if (progress) progressListeners.forEach((listener) => listener(progress));
  });
}
export function subscribeDiscoveryProgress(listener: DiscoveryProgressListener): Unsubscribe {
  ensureProgressListener(); progressListeners.add(listener); let active = true;
  return () => { if (!active) return; active = false; progressListeners.delete(listener); if (!progressListeners.size) { wailsProgressUnsubscribe?.(); wailsProgressUnsubscribe = null; } };
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
