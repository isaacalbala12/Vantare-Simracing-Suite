import { Tabs } from "@base-ui/react/tabs";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { shellText } from "../i18n/shell.es";

export interface SectionTab {
  id: string;
  etiqueta: string;
  visible: boolean;
}

const Context = createContext<
  | {
      tabs: HTMLDivElement | null;
      rail: HTMLDivElement | null;
      railActive: boolean;
      railHidden: boolean;
      title: string | undefined;
      setTabs: (node: HTMLDivElement | null) => void;
      setRail: (node: HTMLDivElement | null) => void;
      setRailActive: (active: boolean) => void;
      setRailHidden: (hidden: boolean) => void;
      setTitle: (title: string | undefined) => void;
    }
  | undefined
>(undefined);

export function SectionChromeProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<HTMLDivElement | null>(null);
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [railActive, setRailActive] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  const [title, setTitle] = useState<string>();
  const value = useMemo(
    () => ({
      tabs,
      rail,
      railActive,
      railHidden,
      title,
      setTabs,
      setRail,
      setRailActive,
      setRailHidden,
      setTitle,
    }),
    [tabs, rail, railActive, railHidden, title],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function useChrome() {
  const value = useContext(Context);
  if (!value) throw new Error("SectionChrome requires the Hub frame");
  return value;
}
/** Portals preserve the screen's providers and state across the three frame areas. */
export function SectionChrome({
  title,
  tabs,
  activeTab,
  onTabChange,
  rail,
}: {
  title?: string;
  tabs?: readonly SectionTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  rail?: ReactNode;
}) {
  const targets = useChrome();
  const hidden = rail === false;
  const active = rail !== undefined && rail !== null && !hidden;
  const setActive = targets.setRailActive;
  const setHidden = targets.setRailHidden;
  const setTitle = targets.setTitle;
  useLayoutEffect(() => {
    setTitle(title);
    return () => setTitle(undefined);
  }, [title, setTitle]);
  useLayoutEffect(() => {
    setActive(active);
    setHidden(hidden);
    return () => {
      setActive(false);
      setHidden(false);
    };
  }, [active, hidden, setActive, setHidden]);
  const visibleTabs = tabs?.filter((tab) => tab.visible) ?? [];
  return (
    <>
      {targets.tabs && visibleTabs.length
        ? createPortal(
            <Tabs.Root
              value={activeTab}
              onValueChange={(value) => {
                if (typeof value === "string") onTabChange?.(value);
              }}
              className="v-section-tabs"
            >
              <Tabs.List
                activateOnFocus
                className="v-section-tab-list"
                aria-label={title ?? shellText.sectionTabs}
              >
                {visibleTabs.map((tab) => (
                  <Tabs.Tab
                    key={tab.id}
                    value={tab.id}
                    className="v-section-tab"
                    id={sectionTabId(tab.id)}
                    aria-controls={
                      activeTab === tab.id ? sectionPanelId(tab.id) : undefined
                    }
                  >
                    {tab.etiqueta}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.Root>,
            targets.tabs,
          )
        : null}
      {targets.rail && rail ? createPortal(rail, targets.rail) : null}
    </>
  );
}
const sectionTabId = (id: string) =>
  `hub-section-tab-${encodeURIComponent(id)}`;
const sectionPanelId = (id: string) =>
  `hub-section-panel-${encodeURIComponent(id)}`;
export function SectionPanel({
  activeTab,
  children,
}: {
  activeTab: string;
  children: ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      id={sectionPanelId(activeTab)}
      aria-labelledby={sectionTabId(activeTab)}
    >
      {children}
    </section>
  );
}
export function SectionTitle({ fallback }: { fallback: string }) {
  return useChrome().title ?? fallback;
}
export function SectionTabsSlot() {
  return <div className="v-section-tabs-slot" ref={useChrome().setTabs} />;
}
export function SectionRailSlot({ fallback }: { fallback: ReactNode }) {
  const chrome = useChrome();
  return (
    <>
      <div className="v-section-rail-slot" ref={chrome.setRail} />
      <div hidden={chrome.railActive}>{fallback}</div>
    </>
  );
}

/** The frame removes its rail only while the mounted screen explicitly opts out. */
export function SectionRailVisibility({ children }: { children: ReactNode }) {
  return useChrome().railHidden ? null : children;
}
