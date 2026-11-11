import { Tabs } from "@base-ui/react/tabs";
import { useLayoutEffect, useRef, useState } from "react";
import {
  studioAddAvailable,
  studioCategories,
  studioLimits,
} from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Callout, Skeleton } from "../Data";
import { SearchInput } from "../Forms";
import { Tooltip } from "../Layers";
import { TrackInspector } from "./TrackInspector";
import { WidgetPreview, WidgetThumb, widgetName } from "./Widgets";

const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
export function StudioRail({ onPlans = () => {} }: { onPlans?: () => void }) {
  const state = useStudio(),
    view = state.view;
  const selected = view?.instances.find((item) => item.id === state.selected);
  const info = view?.catalog.find((widget) => widget.kind === selected?.kind);
  return (
    <aside className="v-studio-rail" aria-label={t.inspector}>
      {view?.state !== "missing" && (
        <>
          <header>
            <h2 data-studio-inspector tabIndex={-1}>
              {selected && view ? (
                <>
                  <WidgetThumb kind={selected.kind} icon />
                  {widgetName(selected, view)}
                </>
              ) : (
                t.catalog
              )}
            </h2>
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => state.setSelected(null)}
              >
                <Icon name="plus" />
                {t.addShort}
              </Button>
            )}
          </header>
          <div className="v-studio-rail-scroll">
            {!view ? (
              <>
                <Skeleton label={t.loading} />
                <Skeleton label={t.loading} />
              </>
            ) : selected ? (
              <>
                <div className="v-studio-inspector-preview">
                  <WidgetPreview
                    kind={selected.kind}
                    opacity={selected.opacity}
                    visible={selected.visible}
                    locked={selected.locked}
                    unverified={view.plan === "unverified"}
                  />
                </div>
                <div className="v-studio-description">
                  <p>{info?.about}</p>
                  <small>
                    {t.dimensions(
                      info?.category ?? "",
                      selected.size.width,
                      selected.size.height,
                    )}
                  </small>
                </div>
                {selected.locked && (
                  <Callout
                    title={
                      view.plan === "unverified"
                        ? t.verifyWidget
                        : t.lockedWidget
                    }
                    actions={<Button onClick={onPlans}>{t.plans}</Button>}
                  />
                )}
                <Tabs.Root value="track">
                  <Tabs.List
                    className="v-studio-tabs"
                    aria-label={t.inspectorTabs}
                  >
                    <Tooltip label={t.soonTooltip}>
                      <Tabs.Tab value="content" disabled>
                        {t.content}
                      </Tabs.Tab>
                    </Tooltip>
                    <Tooltip label={t.soonTooltip}>
                      <Tabs.Tab value="appearance" disabled>
                        {t.appearance}
                      </Tabs.Tab>
                    </Tooltip>
                    <Tabs.Tab value="track">{t.track}</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="track">
                    <TrackInspector key={selected.id} item={selected} />
                  </Tabs.Panel>
                </Tabs.Root>
              </>
            ) : (
              <Catalog onPlans={onPlans} />
            )}
          </div>
        </>
      )}
      <section className="v-studio-obs">
        <h3>
          <Icon name="v-camera" />
          {t.obsSection}
        </h3>
        <p>{t.obsCapture}</p>
        <small>{t.obsUrl}</small>
      </section>
    </aside>
  );
}
function Catalog({ onPlans }: { onPlans: () => void }) {
  const catalog = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () => catalog.current?.querySelector<HTMLInputElement>("input")?.focus(),
    [],
  );
  const state = useStudio(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(t.allCategories);
  const view = state.view;
  if (!view) return null;
  const widgets = view.catalog.filter(
    (w) =>
      (category === t.allCategories || category === w.category) &&
      fold(`${w.name} ${w.about}`).includes(fold(search)),
  );
  const suggested = widgets.filter(
    (w) =>
      w.allowed &&
      w.suggested &&
      !view.instances.some((i) => i.kind === w.kind),
  );
  const groups = [
    { title: t.kit, items: suggested },
    {
      title: t.planWidgets,
      items: widgets.filter((w) => w.allowed && !suggested.includes(w)),
    },
    {
      title: view.plan === "unverified" ? t.unverifiedTitle : t.proTitle,
      items: widgets.filter((w) => !w.allowed),
    },
  ];
  return (
    <div className="v-studio-catalog" ref={catalog}>
      <SearchInput
        label={t.search}
        clearLabel={t.cancel}
        value={search}
        onChange={setSearch}
      />
      <div className="v-studio-categories">
        {[
          t.allCategories,
          ...studioCategories.filter((value) => value !== t.allCategories),
        ].map((value) => (
          <Button
            size="sm"
            variant="ghost"
            key={value}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value}
          </Button>
        ))}
      </div>
      {!widgets.length && <p>{t.noResults}</p>}
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <fieldset
                className="v-studio-catalog-grid"
                aria-label={group.title}
              >
                {group.items.map((widget, index) => (
                  <Tooltip
                    key={widget.kind}
                    label={
                      view.instances.length >= studioLimits.instances
                        ? t.atLimit(studioLimits.instances)
                        : !widget.allowed
                          ? view.plan === "unverified"
                            ? t.verify
                            : t.pro
                          : t.add
                    }
                  >
                    <button
                      type="button"
                      className="v-studio-catalog-widget"
                      data-kind={widget.kind}
                      aria-label={`${t.addShort} ${widget.name}`}
                      aria-disabled={!widget.allowed}
                      disabled={
                        state.pending ||
                        !widget.allowed ||
                        view.instances.length >= studioLimits.instances ||
                        !studioAddAvailable ||
                        view.state !== "ready"
                      }
                      onKeyDown={(event) => {
                        const buttons = Array.from(
                          event.currentTarget
                            .closest("fieldset")
                            ?.querySelectorAll<HTMLButtonElement>(
                              "[data-kind]",
                            ) ?? [],
                        );
                        const step =
                          event.key === "ArrowRight"
                            ? 1
                            : event.key === "ArrowLeft"
                              ? -1
                              : event.key === "ArrowDown"
                                ? 2
                                : event.key === "ArrowUp"
                                  ? -2
                                  : 0;
                        if (step) {
                          event.preventDefault();
                          buttons[
                            (index + step + buttons.length) % buttons.length
                          ]?.focus();
                        }
                      }}
                      onClick={() => {
                        if (!widget.allowed) return;
                        void state.execute({
                          method: "studio.add",
                          kind: widget.kind,
                          baseRevision: view.revision,
                        });
                      }}
                    >
                      <WidgetPreview
                        kind={widget.kind}
                        small
                        locked={!widget.allowed}
                        unverified={view.plan === "unverified"}
                      />
                      <strong>
                        {!widget.allowed && <Icon name="lock" />}
                        {widget.name}
                      </strong>
                      <small>{widget.about}</small>
                      {view.instances.some(
                        (item) => item.kind === widget.kind,
                      ) && (
                        <span className="v-studio-owned">
                          {t.owned(
                            view.instances.filter(
                              (item) => item.kind === widget.kind,
                            ).length,
                          )}
                        </span>
                      )}
                    </button>
                  </Tooltip>
                ))}
              </fieldset>
            </section>
          ),
      )}
      {view.plan === "unverified" ? (
        <p>{t.verify}</p>
      ) : view.catalog.some((w) => !w.allowed) ? (
        <p>
          {t.planNote(
            t.planNames[view.plan],
            t.included(
              view.catalog.filter((w) => w.allowed).map((w) => w.name),
            ),
            view.catalog.filter((w) => !w.allowed).length,
          )}
        </p>
      ) : null}
      {view.catalog.some((w) => !w.allowed) && (
        <Button onClick={onPlans}>{t.plans}</Button>
      )}
    </div>
  );
}
