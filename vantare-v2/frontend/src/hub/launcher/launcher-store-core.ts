import {
  useContext,
  useSyncExternalStore,
} from "react";
import {
  dispatchLauncherCommand as bridgeDispatchLauncherCommand,
  requestSnapshot as bridgeRequestSnapshot,
  subscribeSnapshot as bridgeSubscribeSnapshot,
  subscribeDiscoveryProgress as bridgeSubscribeDiscoveryProgress,
  type LauncherBridgeLike,
} from "./launcher-bridge";
import type { LauncherDiscoveryProgress, LauncherSnapshot } from "./launcher-contract";
import { LauncherStoreContext } from "./launcher-context";

export type { LauncherBridgeLike } from "./launcher-bridge";

export type LauncherStore = {
  getSnapshot: () => LauncherSnapshot | null;
  subscribe: (listener: () => void) => () => void;
  getDiscoveryProgress: () => LauncherDiscoveryProgress | null;
  subscribeDiscoveryProgress: (listener: () => void) => () => void;
  discoverApps: (force?: boolean) => void;
  start: () => void;
  stop: () => void;
  requestSnapshot: () => void;
  dispatchLauncherCommand: (name: string, payload?: unknown) => void;
};

const defaultBridge: LauncherBridgeLike = {
  subscribeSnapshot: bridgeSubscribeSnapshot,
  subscribeDiscoveryProgress: bridgeSubscribeDiscoveryProgress,
  requestSnapshot: bridgeRequestSnapshot,
  dispatchLauncherCommand: bridgeDispatchLauncherCommand,
};

// DISCOVER_TTL_MS is how long a completed scan stays fresh. Entering the
// Launcher tab mounts LauncherPage, which asks for discovery on every mount;
// without a freshness window each visit would re-run the full disk scan
// (registry + Steam libraries + shortcut COM + icons). The Rescan button
// forces a scan regardless of this window.
const DISCOVER_TTL_MS = 5 * 60 * 1000;

export function createLauncherStore(bridge: LauncherBridgeLike = defaultBridge): LauncherStore {
  let snapshot: LauncherSnapshot | null = null;
  let discoveryProgress: LauncherDiscoveryProgress | null = null;
  let discoveryRequested = false;
  let started = false;
  let unsubscribeBridge: (() => void) | null = null;
  const subscribers = new Set<() => void>();
  const progressSubscribers = new Set<() => void>();

  const notify = () => {
    subscribers.forEach((subscriber) => subscriber());
  };

  const store: LauncherStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    start: () => {
      if (started) return;
      started = true;
      unsubscribeBridge = bridge.subscribeSnapshot((nextSnapshot) => {
        snapshot = nextSnapshot;
        notify();
      });
      const unsubscribeProgress = bridge.subscribeDiscoveryProgress?.((next) => { discoveryProgress = next; if (!next.scanning) discoveryRequested = false; progressSubscribers.forEach((subscriber) => subscriber()); }) ?? (() => undefined);
      const previousStop = unsubscribeBridge;
      unsubscribeBridge = () => { previousStop(); unsubscribeProgress(); };
      bridge.requestSnapshot();
    },
    stop: () => {
      if (!started) return;
      started = false;
      unsubscribeBridge?.();
      unsubscribeBridge = null;
      snapshot = null;
      discoveryProgress = null;
      discoveryRequested = false;
      notify();
    },
    requestSnapshot: () => bridge.requestSnapshot(),
    getDiscoveryProgress: () => discoveryProgress,
    subscribeDiscoveryProgress: (listener) => { progressSubscribers.add(listener); return () => progressSubscribers.delete(listener); },
    discoverApps: (force = false) => {
      if (discoveryRequested) return;
      if (
        !force &&
        snapshot?.discovery.lastScanAt
      ) {
        const lastScan = new Date(snapshot.discovery.lastScanAt).getTime();
        if (!Number.isNaN(lastScan) && Date.now() - lastScan < DISCOVER_TTL_MS) {
          return;
        }
      }
      discoveryRequested = true;
      bridge.dispatchLauncherCommand("launcher:apps:discover");
    },
    dispatchLauncherCommand: (name, payload) =>
      bridge.dispatchLauncherCommand(name, payload),
  };

  return store;
}

export function useLauncherDiscoveryProgress(): LauncherDiscoveryProgress | null {
  const store = useLauncherStore();
  return useSyncExternalStore(store.subscribeDiscoveryProgress, store.getDiscoveryProgress, store.getDiscoveryProgress);
}

export function useLauncherStore(): LauncherStore {
  const store = useContext(LauncherStoreContext);
  if (!store) {
    throw new Error("useLauncherStore must be used within LauncherStoreProvider");
  }
  return store;
}

export function useLauncherSnapshot(): LauncherSnapshot | null {
  const store = useLauncherStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useLauncherSelector<T>(
  selector: (snapshot: LauncherSnapshot | null) => T,
): T {
  const snapshot = useLauncherSnapshot();
  return selector(snapshot);
}
