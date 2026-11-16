import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { Section } from "./sections";

export type { Section } from "./sections";

interface UiState {
  section: Section;
  studioLastSelected: string | null;
  rememberStudio: (id: string) => void;
  sidebarCollapsed: boolean;
  sidebarAutomatic: boolean;
  canvasSidebarPrevious: { collapsed: boolean; automatic: boolean } | null;
  canvasSidebar: (active: boolean) => void;
  studioListCollapsed: boolean;
  toggleStudioList: () => void;
  railCollapsed: boolean;
  commandsOpen: boolean;
  noticesOpen: boolean;
  testingReportsRequested: boolean;
  consumeTestingReports: () => void;
  navigate: (section: Section, target?: "reports") => void;
  toggleSidebar: () => void;
  adaptSidebar: (width: number) => void;
  toggleRail: () => void;
  commands: (open: boolean) => void;
  notices: (open: boolean) => void;
}
function createUi() {
  return createStore<UiState>((set) => ({
    section: "settings",
    studioLastSelected: null,
    rememberStudio: (studioLastSelected) => set({ studioLastSelected }),
    sidebarCollapsed: window.innerWidth < 1500,
    sidebarAutomatic: true,
    canvasSidebarPrevious: null,
    studioListCollapsed: false,
    toggleStudioList: () =>
      set((s) => ({ studioListCollapsed: !s.studioListCollapsed })),
    canvasSidebar: (active) =>
      set((s) =>
        active
          ? s.canvasSidebarPrevious
            ? s
            : {
                canvasSidebarPrevious: {
                  collapsed: s.sidebarCollapsed,
                  automatic: s.sidebarAutomatic,
                },
                sidebarCollapsed: true,
                sidebarAutomatic: false,
              }
          : s.canvasSidebarPrevious
            ? {
                sidebarCollapsed: s.canvasSidebarPrevious.collapsed,
                sidebarAutomatic: s.canvasSidebarPrevious.automatic,
                canvasSidebarPrevious: null,
              }
            : s,
      ),
    railCollapsed: false,
    commandsOpen: false,
    noticesOpen: false,
    testingReportsRequested: false,
    consumeTestingReports: () => set({ testingReportsRequested: false }),
    navigate: (section, target) =>
      set({
        section,
        commandsOpen: false,
        testingReportsRequested: section === "testing" && target === "reports",
      }),
    toggleSidebar: () =>
      set((state) => ({
        sidebarCollapsed: !state.sidebarCollapsed,
        sidebarAutomatic: false,
      })),
    adaptSidebar: (width) =>
      set((state) =>
        state.sidebarAutomatic ? { sidebarCollapsed: width < 1500 } : state,
      ),
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
  useEffect(() => {
    const resize = () => store.getState().adaptSidebar(window.innerWidth);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useUi<T>(selector: (state: UiState) => T): T {
  const store = useContext(Context);
  if (!store) throw new Error("UI provider missing");
  return useStore(store, selector);
}
