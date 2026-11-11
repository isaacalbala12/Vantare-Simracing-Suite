import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  studioEditOnScreen,
  studioLimits,
} from "../../../contract/generated/studio";
import { useUi } from "../../app/UiState";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button, IconButton } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { Segmented } from "../../ui/Forms";
import { Tooltip } from "../../ui/Layers";
import { ActionNotice } from "./ActionNotice";
import { DisabledHint } from "./DisabledHint";
import { RemoveWidget } from "./RemoveWidget";
import {
  VisibilityIcon,
  WidgetPreview,
  WidgetThumb,
  widgetName,
  widgetStatus,
} from "./Widgets";
export function Gallery() {
  const state = useStudio(),
    grid = useRef<HTMLElement>(null),
    focusInspector = useRef(false);
  const { view, selected, pending } = state;
  const railCollapsed = useUi((state) => state.railCollapsed);
  const toggleRail = useUi((state) => state.toggleRail);
  const [catalogFocus, setCatalogFocus] = useState(0);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [columns, setColumns] = useState(3);
  const activeFilter = (view?.instances.length ?? 0) >= 9 ? filter : "all";
  const instances = (view?.instances ?? []).filter(
    (item) =>
      activeFilter === "all" || item.visible === (activeFilter === "visible"),
  );

  const focusAfter = state.focusAfter;
  useEffect(() => {
    if ((view?.instances.length ?? 0) < 9) setFilter("all");
  }, [view?.instances.length]);
  useEffect(() => {
    const target = focusAfter.current;
    if (
      !target ||
      state.removing ||
      instances.some((item) => item.id === target.id)
    )
      return;
    const buttons =
      grid.current?.querySelectorAll<HTMLButtonElement>("[data-widget]");
    const next = buttons?.[Math.min(target.index, buttons.length - 1)];
    const fallback = document.querySelector<HTMLButtonElement>(
      '.v-studio-gallery-heading button[aria-pressed="true"]',
    );
    if (next || fallback) (next ?? fallback)?.focus();
    else {
      if (railCollapsed) toggleRail();
      state.setSelected(null);
      setCatalogFocus((value) => value + 1);
    }
    focusAfter.current = undefined;
  }, [
    focusAfter,
    instances,
    state.removing,
    state.setSelected,
    railCollapsed,
    toggleRail,
  ]);
  const toggleVisibility = (id: string, visible: boolean, index: number) => {
    if (!view) return;
    if (activeFilter !== "all") focusAfter.current = { id, index };
    void state
      .execute({
        method: "studio.visibility",
        id,
        visible,
        baseRevision: view.revision,
      })
      .then((value) => {
        if (!value) focusAfter.current = undefined;
      });
  };

  useLayoutEffect(() => {
    const node = grid.current;
    if (!view || !node) return;
    const measure = () =>
      setColumns(
        Math.max(
          1,
          getComputedStyle(node).gridTemplateColumns.split(/\s+/).length,
        ),
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);
  const openCatalog = useCallback(() => {
    if (railCollapsed) toggleRail();
    state.setSelected(null);
    setCatalogFocus((value) => value + 1);
  }, [railCollapsed, toggleRail, state.setSelected]);
  useLayoutEffect(() => {
    if (catalogFocus && selected === null)
      document
        .querySelector<HTMLInputElement>(".v-studio-catalog input")
        ?.focus();
  }, [catalogFocus, selected]);
  useLayoutEffect(() => {
    if (selected && focusInspector.current) {
      document.querySelector<HTMLElement>("[data-studio-inspector]")?.focus();
      focusInspector.current = false;
    }
  }, [selected]);
  useLayoutEffect(() => {
    const added = state.added;
    if (added && added.revision === view?.revision)
      Array.from(
        grid.current?.querySelectorAll<HTMLElement>("[data-widget]") ?? [],
      )
        .find((node) => node.dataset.widget === added.id)
        ?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [state.added, view?.revision]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"],[role="alertdialog"]'))
        return;
      if (
        event.target instanceof Element &&
        event.target.matches("input,textarea,[contenteditable=true]")
      )
        return;
      if (event.key === "Escape") {
        openCatalog();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        view
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
  }, [openCatalog, state, view]);
  if (!view)
    return state.failure ? (
      <Callout
        tone="err"
        title={state.failure.message}
        actions={
          <Button onClick={() => void state.execute({ method: "studio.get" })}>
            {t.reload}
          </Button>
        }
      />
    ) : (
      <div className="v-studio-loading">
        {["one", "two", "three", "four", "five", "six"].map((key) => (
          <Skeleton key={key} label={t.loading} />
        ))}
      </div>
    );
  const disabled =
    pending || view.state !== "ready" || view.plan === "unverified";
  const suggestions = view.catalog
    .filter(
      (widget) =>
        widget.allowed &&
        widget.suggested &&
        !view.instances.some((item) => item.kind === widget.kind),
    )
    .slice(0, columns);
  return (
    <div className="v-studio">
      <RemoveWidget />
      <div className="v-studio-topbar">
        <DisabledHint label={t.localHelp}>
          <Button className="v-studio-layout" disabled aria-label={t.layout}>
            {t.local}
            <Icon name="down" />
          </Button>
        </DisabledHint>
        <DisabledHint label={t.liveHelp}>
          <div className="v-studio-mode">
            <Button disabled data-active="true">
              {t.example}
            </Button>
            <Button disabled>{t.live}</Button>
          </div>
        </DisabledHint>
        <span
          className="v-studio-saved"
          data-failed={!!state.failure}
          role="status"
        >
          {pending
            ? t.saving
            : state.failure
              ? state.failure.message
              : view.state === "ready"
                ? t.saved
                : ""}
        </span>
        <DisabledHint label={t.obsHelp}>
          <Button className="v-studio-obs-button" disabled>
            <Icon name="v-camera" />
            <span className="v-studio-secondary-label">{t.obs}</span>
          </Button>
        </DisabledHint>
        <DisabledHint label={t.editHelp} disabled={!studioEditOnScreen}>
          <Button
            className="v-studio-edit-button"
            disabled={!studioEditOnScreen}
          >
            <Icon name="v-studio" />
            <span className="v-studio-secondary-label">{t.edit}</span>
          </Button>
        </DisabledHint>
        <Tooltip label={t.showHelp}>
          <Button
            variant="primary"
            disabled={pending || (!view.showing && disabled)}
            onClick={() =>
              void state.execute({
                method: "studio.track",
                show: !view.showing,
              })
            }
          >
            <Icon name={view.showing ? "stop" : "play"} />
            {view.showing ? t.hide : t.show}
          </Button>
        </Tooltip>
      </div>
      {state.failure && (
        <Callout
          tone="err"
          title={state.failure.message}
          actions={
            <>
              {state.canRetry ? (
                <Button disabled={pending} onClick={state.retry}>
                  {t.retry}
                </Button>
              ) : (
                <span>{t.reconfirm}</span>
              )}
              <Button disabled={pending} onClick={state.discard}>
                {t.discard}
              </Button>
            </>
          }
        />
      )}
      {view.state === "missing" ? (
        <Callout title={t.missing}>{t.missingHelp}</Callout>
      ) : view.state === "protected" ? (
        <Callout tone="warn" title={t.protected} />
      ) : null}
      {view.state !== "missing" && (
        <div className="v-studio-gallery-panel">
          <header className="v-studio-gallery-heading">
            {view.instances.length > 0 && (
              <span>
                {t.counter(
                  view.instances.length,
                  view.instances.filter((item) => item.visible).length,
                )}
              </span>
            )}
            <small>{t.placementHint}</small>
            {view.instances.length >= 9 && (
              <Segmented
                disabled={pending}
                label={t.filterLabel}
                value={filter}
                options={Object.entries(t.filters).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => {
                  if (
                    value === "all" ||
                    value === "visible" ||
                    value === "hidden"
                  )
                    setFilter(value);
                }}
              />
            )}
          </header>
          <ActionNotice />
          {!view.instances.length && view.state === "ready" && (
            <div className="v-studio-empty">
              <strong>{t.empty}</strong>
              <p>{t.emptyHelp}</p>
            </div>
          )}
          {!instances.length && view.instances.length > 0 && (
            <p className="v-studio-filter-empty">
              {activeFilter === "hidden" ? t.noHidden : t.noVisible}
            </p>
          )}
          <section
            style={
              view.state === "ready" &&
              view.plan !== "unverified" &&
              view.instances.length < 6 &&
              suggestions.length > 0
                ? {
                    gridTemplateRows: `repeat(${Math.max(1, Math.ceil((instances.length + 1) / columns))}, 208px) 20px 208px`,
                  }
                : undefined
            }
            className="v-studio-grid"
            ref={grid}
            aria-label={t.title}
          >
            {instances.map((item, index) => {
              const active = selected === item.id;
              const name = widgetName(item, view);
              return (
                <article
                  key={item.id}
                  className="v-studio-overlay"
                  data-selected={active}
                  data-recent={
                    state.added?.id === item.id &&
                    state.added.revision === view.revision
                  }
                  data-hidden={!item.visible}
                  data-locked={item.locked}
                >
                  <button
                    type="button"
                    data-widget={item.id}
                    className="v-studio-overlay-select"
                    tabIndex={
                      active ||
                      (!instances.some((i) => i.id === selected) && index === 0)
                        ? 0
                        : -1
                    }
                    aria-label={name}
                    aria-pressed={active}
                    onClick={() => {
                      if (active) {
                        document
                          .querySelector<HTMLElement>("[data-studio-inspector]")
                          ?.focus();
                        return;
                      }
                      focusInspector.current = true;
                      state.setSelected(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Delete" && !disabled && !item.locked) {
                        event.preventDefault();
                        state.setRemoving(item.id);
                      }
                      if (event.key === " ") {
                        event.preventDefault();
                        if (!disabled && !item.locked)
                          toggleVisibility(item.id, !item.visible, index);
                      }
                      const buttons = Array.from(
                        grid.current?.querySelectorAll<HTMLButtonElement>(
                          "[data-widget]",
                        ) ?? [],
                      );
                      const columns = Math.max(
                        1,
                        grid.current
                          ? getComputedStyle(grid.current)
                              .gridTemplateColumns.split(/\s+/)
                              .filter((value) => value && value !== "none")
                              .length
                          : 1,
                      );
                      const step =
                        event.key === "ArrowRight"
                          ? 1
                          : event.key === "ArrowLeft"
                            ? -1
                            : event.key === "ArrowDown"
                              ? columns
                              : event.key === "ArrowUp"
                                ? -columns
                                : 0;
                      if (step) {
                        event.preventDefault();
                        buttons[
                          (index + step + buttons.length) % buttons.length
                        ]?.focus();
                      }
                    }}
                  >
                    <header>
                      <span className="v-studio-widget-mark">
                        {item.locked ? (
                          <Icon name="lock" />
                        ) : (
                          <WidgetThumb kind={item.kind} icon />
                        )}
                      </span>
                      <span>
                        <strong>{name}</strong>
                        <small>{widgetStatus(item)}</small>
                      </span>
                    </header>
                    <WidgetPreview
                      kind={item.kind}
                      opacity={item.opacity}
                      visible={item.visible}
                      locked={item.locked}
                      unverified={view.plan === "unverified"}
                    />
                  </button>
                  <div className="v-studio-eye">
                    <IconButton
                      label={item.visible ? t.hideWidget : t.showWidget}
                      variant="ghost"
                      size="sm"
                      disabled={disabled || item.locked}
                      onClick={() =>
                        toggleVisibility(item.id, !item.visible, index)
                      }
                    >
                      <VisibilityIcon visible={item.visible} />
                    </IconButton>
                  </div>
                </article>
              );
            })}
            {view.state === "ready" && (
              <Tooltip
                label={
                  view.instances.length >= studioLimits.instances
                    ? t.atLimit(studioLimits.instances)
                    : t.addHelp
                }
              >
                <Button
                  className="v-studio-add-card"
                  disabled={
                    disabled || view.instances.length >= studioLimits.instances
                  }
                  onClick={openCatalog}
                >
                  <span className="v-studio-add-circle">
                    <Icon name="plus" />
                  </span>
                  <strong>{t.add}</strong>
                  <small>{t.addHelp}</small>
                </Button>
              </Tooltip>
            )}
            {view.state === "ready" &&
              view.plan !== "unverified" &&
              view.instances.length < 6 &&
              suggestions.length > 0 && (
                <section className="v-studio-suggestions" aria-label={t.kit}>
                  <h3>{t.kit}</h3>
                  <div
                    style={{
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {suggestions.map((widget) => (
                      <button
                        type="button"
                        key={widget.kind}
                        disabled={disabled}
                        aria-label={t.suggestedAdd(widget.name)}
                        onClick={() =>
                          void state.execute({
                            method: "studio.add",
                            kind: widget.kind,
                            baseRevision: view.revision,
                          })
                        }
                      >
                        <WidgetPreview kind={widget.kind} />
                        <strong>{widget.name}</strong>
                        <small>{t.suggestionHelp}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
          </section>
          <footer className="v-studio-footer">
            <span>{t.tryWith}</span>
            {t.scenes.map((scene) => (
              <Tooltip label={t.liveHelp} key={scene}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled
                  data-active={scene === "Boxes"}
                >
                  {scene}
                </Button>
              </Tooltip>
            ))}
            <small>{t.lap}</small>
          </footer>
        </div>
      )}
    </div>
  );
}
