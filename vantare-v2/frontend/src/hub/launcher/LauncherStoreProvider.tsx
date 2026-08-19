import { useEffect, type ReactNode } from "react";
import {
  createLauncherStore,
  type LauncherStore,
} from "./launcher-store-core";
import { LauncherStoreContext } from "./launcher-context";

const defaultStore = createLauncherStore();

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

  return <LauncherStoreContext.Provider value={store}>{children}</LauncherStoreContext.Provider>;
}
