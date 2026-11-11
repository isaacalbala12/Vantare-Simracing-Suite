import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { studioLimits } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Callout, Skeleton } from "../Data";
import { SearchInput, Switch } from "../Forms";
import { Tooltip } from "../Layers";
import { WidgetPreview, WidgetThumb, widgetName } from "./Widgets";

const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
export function StudioRail({ onPlans = () => {} }: { onPlans?: () => void }) {
  const state = useStudio(),
    view = state.view;
  const selected = view?.instances.find((item) => item.id === state.selected);
  const info = view?.catalog.find((widget) => widget.kind === selected?.kind);
  const disabled =
    state.pending || view?.state !== "ready" || view.plan === "unverified";
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
                  <Tabs.List className="v-studio-tabs" aria-label={t.title}>
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
                    <div className="v-studio-track-summary">
                      <Switch
                        label={t.visible}
                        checked={selected.visible}
                        disabled={disabled || selected.locked}
                        onCheckedChange={(visible) =>
                          void state.execute({
                            method: "studio.visibility",
                            id: selected.id,
                            visible,
                            baseRevision: view.revision,
                          })
                        }
                      />
                    </div>
                  </Tabs.Panel>
                </Tabs.Root>
              </>
            ) : (
              <Catalog />
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
function Catalog() {
  const state = useStudio(),
    view = state.view;
  const [search, setSearch] = useState(""),
    [added, setAdded] = useState<string>();
  if (!view) return null;
  return (
    <div className="v-studio-catalog">
      <SearchInput
        label={t.search}
        clearLabel={t.cancel}
        value={search}
        onChange={setSearch}
      />
      {!view.catalog.some((widget) =>
        fold(`${widget.name} ${widget.about}`).includes(fold(search)),
      ) && <p>{t.noResults}</p>}
      <div className="v-studio-basic-catalog">
        {view.catalog
          .filter((widget) =>
            fold(`${widget.name} ${widget.about}`).includes(fold(search)),
          )
          .map((widget) => (
            <Tooltip
              key={widget.kind}
              label={
                !widget.allowed
                  ? t.verifyWidget
                  : view.instances.length >= studioLimits.instances
                    ? t.atLimit(studioLimits.instances)
                    : widget.about
              }
            >
              <Button
                className="v-studio-catalog-choice"
                aria-label={`${t.addShort} ${widget.name}`}
                disabled={
                  !widget.allowed ||
                  state.pending ||
                  view.state !== "ready" ||
                  view.instances.length >= studioLimits.instances
                }
                onClick={() =>
                  void state
                    .execute({
                      method: "studio.add",
                      kind: widget.kind,
                      baseRevision: view.revision,
                    })
                    .then((value) => {
                      if (value) setAdded(value.revision);
                    })
                }
              >
                <WidgetThumb kind={widget.kind} icon />
                {widget.name}
                {!widget.allowed && <Icon name="lock" />}
              </Button>
            </Tooltip>
          ))}
      </div>
      {added === view.revision && (
        <Callout
          title={t.added}
          actions={
            <Button
              disabled={state.pending || !view.canUndo}
              onClick={() =>
                void state.execute({
                  method: "studio.undo",
                  baseRevision: view.revision,
                })
              }
            >
              {t.undo}
            </Button>
          }
        />
      )}
    </div>
  );
}
