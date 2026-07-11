import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  dispatchLauncherCommand as bridgeDispatchLauncherCommand,
  requestSnapshot as bridgeRequestSnapshot,
  subscribeSnapshot as bridgeSubscribeSnapshot,
  type LauncherBridgeLike,
} from "./launcher-bridge";
import type { LauncherSnapshot } from "./launcher-contract";

export type { LauncherBridgeLike } from "./launcher-bridge";

export type LauncherStore = {
  getSnapshot: () => LauncherSnapshot | null;
  subscribe: (listener: () => void) => () => void;
  start: () => void;
  stop: () => void;
  requestSnapshot: () => void;
  dispatchLauncherCommand: (name: string, payload?: unknown) => void;
};

const defaultBridge: LauncherBridgeLike = {
  subscribeSnapshot: bridgeSubscribeSnapshot,
  requestSnapshot: bridgeRequestSnapshot,
  dispatchLauncherCommand: bridgeDispatchLauncherCommand,
};

export function createLauncherStore(bridge: LauncherBridgeLike = defaultBridge): LauncherStore {
  let snapshot: LauncherSnapshot | null = null;
  let started = false;
  let unsubscribeBridge: (() => void) | null = null;
  const subscribers = new Set<() => void>();

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
      bridge.requestSnapshot();
    },
    stop: () => {
      if (!started) return;
      started = false;
      unsubscribeBridge?.();
      unsubscribeBridge = null;
      snapshot = null;
      notify();
    },
    requestSnapshot: () => bridge.requestSnapshot(),
    dispatchLauncherCommand: (name, payload) =>
      bridge.dispatchLauncherCommand(name, payload),
  };

  return store;
}

const defaultStore = createLauncherStore();
const LauncherStoreContext = createContext<LauncherStore | null>(null);

export function LauncherStoreProvider({
  children,
  store = defaultStore,
}: {
  children: ReactNode;
  store?: LauncherStore;
}) {
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return (
    <LauncherStoreContext.Provider value={store}>
      {children}
    </LauncherStoreContext.Provider>
  );
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
