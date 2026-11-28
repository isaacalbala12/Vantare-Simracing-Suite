import { Menu } from "@base-ui/react/menu";
import { Tabs } from "@base-ui/react/tabs";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { shellText } from "../i18n/shell.es";

export interface SectionTab {
  id: string;
  etiqueta: string;
  visible: boolean;
  ariaDisabled?: boolean;
  description?: string;
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
  const tabList = useRef<HTMLDivElement>(null);
  // Issue 2896: pestañas que no caben enteras; el menú «⋯» las ofrece al ratón.
  const [clipped, setClipped] = useState<readonly string[]>([]);
  const chosen = useRef<HTMLElement | null>(null);
  // The selected tab is revealed when the selection or the row width changes
  // (menu, keyboard, sidebar rail links, search, window or sidebar resize),
  // never on a scroll: a scroll is the user (or a click) reaching another tab.
  const selected = useRef(activeTab);
  const width = useRef<number>(undefined);
  useLayoutEffect(() => {
    selected.current = activeTab;
    if (activeTab)
      revealClipped(document.getElementById(sectionTabId(activeTab)));
  }, [activeTab]);
  useLayoutEffect(() => {
    if (!targets.tabs || !tabs?.length) return;
    const list = tabList.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    // Keep clipped tabs in the keyboard order; focusing one scrolls it fully into view.
    const observedTabs = list.querySelectorAll('[role="tab"]');
    const update = () => {
      const bounds = list.getBoundingClientRect();
      const next: string[] = [];
      for (const tab of observedTabs) {
        const box = tab.getBoundingClientRect();
        // 1 px of slack: with fractional zoom (90 %, 110 %, Windows 125 %) the
        // scroll snaps to device pixels and a whole tab can sit ~0.5 px out.
        const out = box.left < bounds.left - 1 || box.right > bounds.right + 1;
        tab.toggleAttribute("data-clipped", out);
        const id = tab.getAttribute("data-tab-id");
        if (out && id) next.push(id);
      }
      setClipped((current) =>
        current.join(" ") === next.join(" ") ? current : next,
      );
      return bounds.width;
    };
    const resize = () => {
      const current = update();
      if (current === width.current) return;
      width.current = current;
      if (selected.current)
        revealClipped(document.getElementById(sectionTabId(selected.current)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(list);
    for (const tab of observedTabs) observer.observe(tab);
    list.addEventListener("scroll", update, { passive: true });
    resize();
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", update);
    };
  }, [targets.tabs, tabs]);
  const hiddenTabs = visibleTabs.filter((tab) => clipped.includes(tab.id));
  // «Más pestañas de Ajustes»: el nombre de la pantalla es su título de sección.
  const moreLabel = title
    ? shellText.moreSectionTabs(title)
    : shellText.sectionTabs;
  return (
    <>
      {targets.tabs && visibleTabs.length
        ? createPortal(
            <Tabs.Root
              value={activeTab}
              onValueChange={(value) => {
                if (
                  typeof value === "string" &&
                  !visibleTabs.find((tab) => tab.id === value)?.ariaDisabled
                )
                  onTabChange?.(value);
              }}
              className="v-section-tabs"
            >
              <Tabs.List
                ref={tabList}
                activateOnFocus
                className="v-section-tab-list"
                aria-label={title ?? shellText.sectionTabs}
                onFocusCapture={(event) => {
                  if (event.target instanceof HTMLElement)
                    event.target.closest('[role="tab"]')?.scrollIntoView?.({
                      block: "nearest",
                      inline: "nearest",
                    });
                }}
              >
                {visibleTabs.map((tab) => (
                  <Fragment key={tab.id}>
                    <Tabs.Tab
                      aria-disabled={tab.ariaDisabled || undefined}
                      aria-describedby={
                        tab.description
                          ? `${sectionTabId(tab.id)}-description`
                          : undefined
                      }
                      title={tab.description}
                      value={tab.id}
                      data-tab-id={tab.id}
                      className="v-section-tab"
                      id={sectionTabId(tab.id)}
                      aria-controls={
                        activeTab === tab.id
                          ? sectionPanelId(tab.id)
                          : undefined
                      }
                    >
                      {tab.etiqueta}
                    </Tabs.Tab>
                    {tab.description && (
                      <span
                        className="v-sr-only"
                        id={`${sectionTabId(tab.id)}-description`}
                      >
                        {tab.description}
                      </span>
                    )}
                  </Fragment>
                ))}
              </Tabs.List>
              {/* Fuera de la tablist: una tablist solo contiene pestañas. */}
              <Menu.Root
                modal={false}
                onOpenChange={(open) => {
                  if (open) chosen.current = null;
                }}
              >
                <Menu.Trigger
                  className="v-button v-button--ghost v-section-tabs-more"
                  aria-label={moreLabel}
                  title={moreLabel}
                  hidden={!hiddenTabs.length}
                >
                  <span aria-hidden="true">{shellText.moreSymbol}</span>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    className="v-positioner"
                    align="end"
                    sideOffset={6}
                  >
                    <Menu.Popup
                      className="v-popup v-section-tabs-menu"
                      aria-label={moreLabel}
                      // The chosen tab receives focus, so it scrolls into view.
                      finalFocus={() => chosen.current ?? true}
                    >
                      {hiddenTabs.map((tab) => (
                        <Menu.Item
                          key={tab.id}
                          className="v-option"
                          disabled={tab.ariaDisabled}
                          onClick={() => {
                            chosen.current = document.getElementById(
                              sectionTabId(tab.id),
                            );
                            onTabChange?.(tab.id);
                          }}
                        >
                          {tab.etiqueta}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </Tabs.Root>,
            targets.tabs,
          )
        : null}
      {targets.rail && rail ? createPortal(rail, targets.rail) : null}
    </>
  );
}
/** Scrolls a clipped tab fully into the tab list, without moving the page. */
function revealClipped(tab: HTMLElement | null) {
  if (!tab?.hasAttribute("data-clipped")) return;
  tab.scrollIntoView?.({
    block: "nearest",
    inline: "nearest",
    container: "nearest",
  } as ScrollIntoViewOptions);
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
