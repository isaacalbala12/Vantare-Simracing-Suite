import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
export type Section =
  | "home"
  | "launcher"
  | "studio"
  | "roadmap"
  | "testing"
  | "calendar"
  | "strategy"
  | "engineer"
  | "settings";
interface UiState {
  section: Section;
  sidebarCollapsed: boolean;
  railCollapsed: boolean;
  commandsOpen: boolean;
  noticesOpen: boolean;
  navigate: (section: Section) => void;
  toggleSidebar: () => void;
  toggleRail: () => void;
  commands: (open: boolean) => void;
  notices: (open: boolean) => void;
}
function createUi() {
  return createStore<UiState>((set) => ({
    section: "settings",
    sidebarCollapsed: false,
    railCollapsed: false,
    commandsOpen: false,
    noticesOpen: false,
    navigate: (section) => set({ section, commandsOpen: false }),
    toggleSidebar: () =>
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
    commands: (commandsOpen) => set({ commandsOpen }),
    notices: (noticesOpen) => set({ noticesOpen }),
  }));
}
const Context = createContext<ReturnType<typeof createUi> | undefined>(
  undefined,
);
export function UiProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createUi);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useUi<T>(selector: (state: UiState) => T): T {
  const store = useContext(Context);
  if (!store) throw new Error("UI provider missing");
  return useStore(store, selector);
}
