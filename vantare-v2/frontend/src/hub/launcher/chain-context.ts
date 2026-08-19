import { createContext } from "react";
import type { createChainStore } from "./chain-store-core";

export type ChainRunnerStore = ReturnType<typeof createChainStore>;
export const ChainRunnerContext = createContext<ChainRunnerStore | null>(null);
