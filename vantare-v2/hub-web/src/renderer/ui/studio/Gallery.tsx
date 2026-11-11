import { useEffect, useLayoutEffect, useRef } from "react";
import { studioEditOnScreen } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button, IconButton } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { Tooltip } from "../../ui/Layers";
import { VisibilityIcon, WidgetThumb } from "./Widgets";
export function Gallery() {
  const state = useStudio(),
    grid = useRef<HTMLDivElement>(null),
    focusInspector = useRef(false);
  const { view, selected, pending } = state;
  useLayoutEffect(() => {
    if (focusInspector.current) {
      document.querySelector<HTMLElement>("[data-studio-inspector]")?.focus();
      focusInspector.current = false;
    }
  }, [selected]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"],[role="alertdialog"]'))
        return;
      if (
        (event.target as HTMLElement)?.matches(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      if (event.key === "Escape") {
        state.setSelected(null);
        grid.current
          ?.querySelector<HTMLButtonElement>("[data-widget]")
          ?.focus();
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
  }, [state, view]);
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
      <Skeleton label={t.loading} />
    );
  const disabled =
    pending || view.state !== "ready" || view.plan === "unverified";
  return (
    <div className="v-studio">
      <div className="v-studio-topbar">
        <Tooltip label={t.localHelp}>
          <Button className="v-studio-layout" disabled aria-label={t.layout}>
            {t.local}
            <Icon name="down" />
          </Button>
        </Tooltip>
        <Tooltip label={t.liveHelp}>
          <div className="v-studio-mode">
            <Button disabled data-active="true">
              {t.example}
            </Button>
            <Button disabled>{t.live}</Button>
          </div>
        </Tooltip>
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
        <Tooltip label={t.obsHelp}>
          <Button disabled>{t.obs}</Button>
        </Tooltip>
        <Tooltip label={t.editHelp}>
          <Button disabled={!studioEditOnScreen}>
            <Icon name="v-studio" />
            {t.edit}
          </Button>
        </Tooltip>
        <Button
          variant="primary"
          disabled={disabled || view.plan === "unverified"}
          onClick={() =>
            void state.execute({ method: "studio.track", show: !view.showing })
          }
        >
          <Icon name={view.showing ? "stop" : "play"} />
          {view.showing ? t.hide : t.show}
        </Button>
      </div>
      {state.failure && (
        <Callout
          tone="err"
          title={state.failure.message}
          actions={
            <>
              <Button disabled={pending} onClick={state.retry}>
                {t.retry}
              </Button>
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
      <div className="v-studio-gallery-panel">
        {!view.instances.length && view.state === "ready" && <p>{t.empty}</p>}
        <div
          className="v-studio-grid"
          ref={grid}
          role="grid"
          aria-label={t.title}
        >
          {view.instances.map((item, index) => {
            const info = view.catalog.find((w) => w.kind === item.kind);
            const active = selected === item.id;
            const name = info?.name ?? item.kind;
            return (
              <article
                role="gridcell"
                key={item.id}
                className="v-studio-overlay"
                data-selected={active}
                data-hidden={!item.visible}
              >
                <button
                  type="button"
                  data-widget={item.id}
                  className="v-studio-overlay-select"
                  tabIndex={
                    active ||
                    (!view.instances.some((i) => i.id === selected) &&
                      index === 0)
                      ? 0
                      : -1
                  }
                  aria-label={name}
                  aria-pressed={active}
                  onClick={() => {
                    focusInspector.current = true;
                    state.setSelected(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === " ") {
                      event.preventDefault();
                      if (!disabled)
                        void state.execute({
                          method: "studio.visibility",
                          id: item.id,
                          visible: !item.visible,
                          baseRevision: view.revision,
                        });
                    }
                    const buttons = Array.from(
                      grid.current?.querySelectorAll<HTMLButtonElement>(
                        "[data-widget]",
                      ) ?? [],
                    );
                    const columns = Math.max(
                      1,
                      Math.floor((grid.current?.clientWidth ?? 280) / 280),
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
                      <small>{item.visible ? t.visible : t.hidden}</small>
                    </span>
                    {item.locked && (
                      <small>
                        {view.plan === "unverified" ? t.unverified : t.pro}
                      </small>
                    )}
                  </header>
                  <div
                    className="v-studio-preview"
                    style={{
                      opacity: item.visible ? item.opacity / 100 : 0.45,
                    }}
                  >
                    <span
                      style={{
                        aspectRatio: `${item.size.width}/${item.size.height}`,
                      }}
                    >
                      <WidgetThumb kind={item.kind} />
                    </span>
                  </div>
                </button>
                <div className="v-studio-eye">
                  <IconButton
                    label={item.visible ? t.hideWidget : t.showWidget}
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      void state.execute({
                        method: "studio.visibility",
                        id: item.id,
                        visible: !item.visible,
                        baseRevision: view.revision,
                      })
                    }
                  >
                    <VisibilityIcon visible={item.visible} />
                  </IconButton>
                </div>
              </article>
            );
          })}
          <Button
            className="v-studio-add-card"
            disabled={view.state !== "ready"}
            onClick={() => state.setSelected(null)}
          >
            <Icon name="plus" />
            {t.add}
          </Button>
        </div>
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
    </div>
  );
}
