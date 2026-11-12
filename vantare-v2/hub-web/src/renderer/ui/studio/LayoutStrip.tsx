import { studioLimits } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button, IconButton } from "../Button";
import { Skeleton } from "../Data";
import { Tooltip } from "../Layers";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import {
  VisibilityIcon,
  WidgetPreview,
  widgetName,
  widgetStatus,
} from "./Widgets";

export function LayoutStrip({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state, items, selected, blocked } = model;
  const view = state.view;
  return (
    <aside className="v-focus-strip" aria-label={t.layoutLabel}>
      <header className="v-focus-layout-name">
        <div>
          <small>{t.layoutLabel}</small>
          <strong>{t.local}</strong>
        </div>
        <IconButton label={t.localHelp} size="sm" variant="ghost">
          <Icon name="info" />
        </IconButton>
      </header>
      <div className="v-focus-save" role="status" data-failed={!!state.failure}>
        {state.pending
          ? t.saving
          : state.failure
            ? t.notSaved
            : view?.state === "protected"
              ? t.readOnly
              : view?.state === "ready"
                ? t.saved
                : t.loading}
      </div>
      <div className="v-focus-list-heading">
        {view?.state === "ready" && (
          <>
            <span>{t.overlaysCount(view.instances.length)}</span>
            <span>
              {t.visibleCount(
                view.instances.filter((item) => item.visible).length,
              )}
            </span>
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
      <section className="v-studio-list" aria-label={t.title}>
        {!view
          ? [0, 1, 2, 3].map((n) => <Skeleton key={n} label={t.loading} />)
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
                  aria-keyshortcuts="Space Delete"
                  aria-label={`${widgetName(item, view)}, ${widgetStatus(item)}`}
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
                  <span className="v-focus-row-name">
                    <strong>{widgetName(item, view)}</strong>
                    <small>{widgetStatus(item)}</small>
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
        {view && !items.length && (
          <p>
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
      <Tooltip
        label={
          view && view.instances.length >= studioLimits.instances
            ? t.atLimit(studioLimits.instances)
            : blocked
              ? view?.plan === "unverified"
                ? t.verifyWidget
                : t.protectedAction
              : t.addHelp
        }
      >
        <Button
          className="v-focus-add"
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
        <span>{t.placementHint}</span>
      </footer>
    </aside>
  );
}
