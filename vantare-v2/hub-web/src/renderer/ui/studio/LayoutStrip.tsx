import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { useId } from "react";
import { studioLimits } from "../../../contract/generated/studio";
import { useUi } from "../../app/UiState";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button, IconButton } from "../Button";
import { Tooltip } from "../Layers";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { StudioSaveStatus } from "./StudioStates";
import {
  VisibilityIcon,
  WidgetPreview,
  widgetName,
  widgetStatus,
} from "./Widgets";

export function LayoutStrip({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state, items, selected, blocked } = model;
  const addHint = useId();
  const view = state.view;
  const addLabel =
    view && view.instances.length >= studioLimits.instances
      ? t.atLimit(studioLimits.instances)
      : model.canvasReadOnly
        ? canvasText.readOnly
        : blocked
        ? view?.plan === "unverified"
          ? t.verifyWidget
          : t.protectedAction
        : t.addHelp;
  const collapsed = useUi((value) => value.studioListCollapsed);
  const toggleList = useUi((value) => value.toggleStudioList);
  return (
    <aside className="v-focus-strip" aria-label={t.layoutLabel}>
      <header className="v-focus-layout-name">
        {state.canvasMode && (
          <IconButton
            label={collapsed ? canvasText.expandList : canvasText.collapseList}
            aria-expanded={!collapsed}
            onClick={toggleList}
            size="sm"
            variant="ghost"
          >
            <Icon name="v-side" />
          </IconButton>
        )}
        <span className="v-focus-layout-icon" aria-hidden="true">
          <Icon name="v-studio" />
        </span>
        <div>
          <small>{t.layoutLabel}</small>
          {state.canvasMode ? (
            <BaseTooltip.Root>
              <BaseTooltip.Trigger render={<strong />}>
                {t.local}
              </BaseTooltip.Trigger>
              <BaseTooltip.Portal>
                <BaseTooltip.Positioner className="v-positioner" sideOffset={6}>
                  <BaseTooltip.Popup
                    className="v-tooltip"
                    role="tooltip"
                    aria-hidden="true"
                  >
                    {t.local}
                  </BaseTooltip.Popup>
                </BaseTooltip.Positioner>
              </BaseTooltip.Portal>
            </BaseTooltip.Root>
          ) : (
            <strong>{t.local}</strong>
          )}
        </div>
        <IconButton label={t.localHelp} size="sm" variant="ghost">
          <Icon name="info" />
        </IconButton>
      </header>
      <StudioSaveStatus model={model} />
      <div className="v-focus-list-heading">
        {(view?.state === "ready" ||
          (view?.state === "protected" && view.instances.length > 0)) && (
          <>
            <span>{t.overlaysCount(view.instances.length)}</span>
            {view.instances.length > 0 && (
              <span>
                {t.visibleCount(
                  view.instances.filter((item) => item.visible).length,
                )}
              </span>
            )}
          </>
        )}
      </div>
      {view && view.instances.length >= 9 && (
        <fieldset className="v-focus-filters" aria-label={t.filterLabel}>
          {(["all", "visible", "hidden"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant="ghost"
              aria-pressed={model.filter === value}
              aria-disabled={state.pending}
              onClick={() => {
                if (!state.pending) model.setFilter(value);
              }}
            >
              {t.filters[value]}
            </Button>
          ))}
        </fieldset>
      )}
      <section className="v-studio-list" aria-label={t.title} tabIndex={-1}>
        {!view
          ? state.failure
            ? null
            : [0, 1, 2, 3].map((n) => (
                <span key={n} className="v-skeleton" aria-hidden="true" />
              ))
          : items.map((item, index) => (
              <div
                key={item.id}
                className="v-focus-row"
                data-selected={selected?.id === item.id}
                data-hidden={!item.visible}
              >
                <button
                  type="button"
                  data-widget={item.id}
                  aria-pressed={selected?.id === item.id}
                  aria-keyshortcuts="Space Delete Control+D"
                  aria-labelledby={`${addHint}-name-${index}`}
                  tabIndex={
                    item.id === selected?.id ||
                    (!items.some((value) => value.id === selected?.id) &&
                      index === 0)
                      ? 0
                      : -1
                  }
                  onClick={() => model.select(item.id)}
                  onKeyDown={(event) => {
                    if (model.move(index, event.key)) event.preventDefault();
                    if (event.key === "Enter") {
                      event.preventDefault();
                      model.focusOptions();
                    }
                    if (event.key === " ") {
                      event.preventDefault();
                      model.toggle(item.id);
                    }
                    if (
                      event.key === "Delete" &&
                      !blocked &&
                      !state.pending &&
                      !item.locked
                    ) {
                      event.preventDefault();
                      state.setRemoving(item.id);
                    }
                  }}
                >
                  <WidgetPreview kind={item.kind} small />
                  <span
                    className="v-focus-row-name"
                    id={`${addHint}-name-${index}`}
                  >
                    <strong>{widgetName(item, view)}</strong>
                    {!state.canvasMode && <small>{widgetStatus(item)}</small>}
                  </span>
                </button>
                <IconButton
                  label={
                    item.locked
                      ? t.lockedWidget
                      : item.visible
                        ? t.hideWidget
                        : t.showWidget
                  }
                  tabIndex={-1}
                  variant="ghost"
                  size="sm"
                  disabled={blocked || item.locked}
                  aria-disabled={state.pending}
                  onClick={() => model.toggle(item.id)}
                >
                  {item.locked ? (
                    <Icon name="lock" />
                  ) : (
                    <VisibilityIcon visible={item.visible} />
                  )}
                </IconButton>
              </div>
            ))}
        {view &&
          !items.length &&
          (view.state === "ready" || view.instances.length > 0) && (
            <p
              className={
                view.state === "ready" && !view.instances.length
                  ? "v-focus-empty-list"
                  : undefined
              }
            >
              {view.instances.length
                ? model.filter === "hidden"
                  ? t.noHidden
                  : t.noVisible
                : view.state === "ready"
                  ? t.emptyList
                  : t.readOnly}
            </p>
          )}
      </section>
      <Tooltip id={addHint} label={addLabel}>
        <Button
          className="v-focus-add"
          data-empty={view?.state === "ready" && !view.instances.length}
          aria-label={t.add}
          aria-describedby={addHint}
          focusableWhenDisabled
          data-add-widget
          disabled={
            blocked || (view?.instances.length ?? 0) >= studioLimits.instances
          }
          aria-disabled={state.pending}
          onClick={() => {
            if (!state.pending) model.setCatalogOpen(true);
          }}
        >
          <Icon name="plus" />
          <span>{t.add}</span>
        </Button>
      </Tooltip>
      <footer>
        <Icon name="v-studio" />
        <span>
          {state.canvasMode ? canvasText.placementHint : t.placementHint}
        </span>
        {!state.canvasMode && (
          <button type="button" onClick={() => state.setCanvasMode(true)}>
            {canvasText.openLink}
          </button>
        )}
      </footer>
    </aside>
  );
}

import { canvasText } from "../../i18n/studio-canvas";
