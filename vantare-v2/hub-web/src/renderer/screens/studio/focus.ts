import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUi } from "../../app/UiState";
import { hubKeys } from "../../ui/hub-shortcuts";
import { initialStudioSelection } from "./selection";
import { useStudio } from "./state";

export function useStudioFocus() {
  const state = useStudio();
  const { view } = state;
  const root = useRef<HTMLDivElement>(null);
  const lastAdded = useRef<string | undefined>(undefined);
  const remembered = useUi((value) => value.studioLastSelected);
  const remember = useUi((value) => value.rememberStudio);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const activeFilter = (view?.instances.length ?? 0) >= 9 ? filter : "all";
  const items = (view?.instances ?? []).filter(
    (item) =>
      activeFilter === "all" || item.visible === (activeFilter === "visible"),
  );
  const initial = view ? initialStudioSelection(view, remembered) : null;
  const selected =
    view?.instances.find((item) => item.id === state.selected) ??
    view?.instances.find((item) => item.id === initial);
  const select = (id: string) => {
    state.setSelected(id);
    remember(id);
  };
  const row = (id: string) =>
    Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("[data-widget]") ?? [],
    ).find((node) => node.dataset.widget === id);
  const focusOptions = () =>
    root.current
      ?.querySelector<HTMLElement>(
        '.v-studio-temporary [role="tab"][aria-selected="true"]',
      )
      ?.focus();
  const blocked = view?.state !== "ready" || view.plan === "unverified";
  useEffect(() => {
    if ((view?.instances.length ?? 0) < 9) setFilter("all");
  }, [view?.instances.length]);
  useLayoutEffect(() => {
    const target = state.focusAfter.current;
    if (
      target &&
      !state.removing &&
      !items.some((item) => item.id === target.id)
    ) {
      const next = items[Math.min(target.index, items.length - 1)];
      if (next) {
        if (!view?.instances.some((item) => item.id === state.selected))
          select(next.id);
        row(next.id)?.focus();
      } else
        root.current?.querySelector<HTMLElement>("[data-add-widget]")?.focus();
      state.focusAfter.current = undefined;
    } else if (
      selected &&
      !view?.instances.some((item) => item.id === state.selected)
    )
      select(selected.id);
    const added = state.added;
    if (
      added &&
      added.revision === view?.revision &&
      lastAdded.current !== added.revision
    ) {
      // Reveal the added row before selecting and focusing its mounted button.
      if (activeFilter !== "all") {
        setFilter("all");
        return;
      }
      lastAdded.current = added.revision;
      setCatalogOpen(false);
      select(added.id);
      row(added.id)?.focus();
      row(added.id)?.scrollIntoView?.({ block: "nearest" });
    }
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !view ||
        document.querySelector('[role="dialog"],[role="alertdialog"]') ||
        (event.target instanceof Element &&
          event.target.matches("input,textarea,[contenteditable=true]"))
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === hubKeys.undo
      ) {
        event.preventDefault();
        if (event.shiftKey ? view.canRedo : view.canUndo)
          void state.execute({
            method: event.shiftKey ? "studio.redo" : "studio.undo",
            baseRevision: view.revision,
          });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, state.execute]);
  const toggle = (id: string) => {
    const item = view?.instances.find((item) => item.id === id);
    if (!view || !item || item.locked || blocked || state.pending) return;
    if (activeFilter !== "all")
      state.focusAfter.current = {
        id,
        index: items.findIndex((value) => value.id === id),
      };
    void state
      .execute({
        method: "studio.visibility",
        id,
        visible: !item.visible,
        baseRevision: view.revision,
      })
      .then((value) => {
        if (!value) state.focusAfter.current = undefined;
      });
  };
  const move = (index: number, key: string) => {
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? items.length - 1
          : key === "ArrowDown"
            ? Math.min(index + 1, items.length - 1)
            : key === "ArrowUp"
              ? Math.max(index - 1, 0)
              : -1;
    if (next < 0 || !items[next]) return false;
    select(items[next].id);
    row(items[next].id)?.focus();
    return true;
  };
  return {
    state,
    root,
    items,
    selected,
    select,
    toggle,
    move,
    focusOptions,
    filter: activeFilter,
    setFilter,
    catalogOpen,
    setCatalogOpen,
    blocked,
  };
}
