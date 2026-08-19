import { createContext } from "react";
import type { LauncherStore } from "./launcher-store-core";

export const LauncherStoreContext = createContext<LauncherStore | null>(null);
