import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useEffect, useState } from "react";
import type { OverlayInstance } from "../../../contract/generated/contract";
import {
  studioAddAvailable,
  studioCategories,
  studioLimits,
} from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { Checkbox, SearchInput, Select, Slider, Switch } from "../../ui/Forms";
import { Tooltip } from "../../ui/Layers";
import { WidgetThumb } from "./Widgets";

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
export function StudioRail({ onPlans = () => {} }: { onPlans?: () => void }) {
  const state = useStudio(),
    [tab, setTab] = useState("content");
  const selected = state.view?.instances.find(
    (item) => item.id === state.selected,
  );
  return (
    <aside className="v-studio-rail">
      <header>
        <h2 data-studio-inspector tabIndex={-1}>
          {selected ? (
            <>
              <WidgetThumb kind={selected.kind} icon />
              {state.view?.catalog.find((w) => w.kind === selected.kind)
                ?.name ?? selected.kind}
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
      {selected ? (
        <Tabs.Root
          value={tab}
          onValueChange={(value) => {
            if (typeof value === "string") setTab(value);
          }}
        >
          <Tabs.List className="v-studio-tabs" aria-label={t.title}>
            <Tabs.Tab value="content">{t.content}</Tabs.Tab>
            <Tabs.Tab value="appearance">{t.appearance}</Tabs.Tab>
            <Tabs.Tab value="track">{t.track}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="content">
            <p className="v-studio-soon">{t.soon}</p>
          </Tabs.Panel>
          <Tabs.Panel value="appearance">
            <p className="v-studio-soon">{t.soon}</p>
          </Tabs.Panel>
          <Tabs.Panel value="track">
            <TrackInspector key={selected.id} item={selected} />
          </Tabs.Panel>
        </Tabs.Root>
      ) : (
        <Catalog onPlans={onPlans} />
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
function TrackInspector({ item }: { item: OverlayInstance }) {
  const state = useStudio(),
    [opacity, setOpacity] = useState(item.opacity),
    [removing, setRemoving] = useState(false);
  const view = state.view;
  useEffect(() => setOpacity(item.opacity), [item.opacity]);
  if (!view) return null;
  const disabled =
    state.pending || view.state !== "ready" || view.plan === "unverified";
  const patch = (
    value: import("../../../contract/generated/contract").InstancePatch,
  ) =>
    void state.execute({
      method: "studio.instance",
      id: item.id,
      patch: value,
      baseRevision: view.revision,
    });
  return (
    <div className="v-studio-inspector-fields">
      <Switch
        label={t.visible}
        checked={item.visible}
        disabled={disabled}
        onCheckedChange={(visible) =>
          void state.execute({
            method: "studio.visibility",
            id: item.id,
            visible,
            baseRevision: view.revision,
          })
        }
      />
      <Slider
        label={t.opacity}
        value={opacity}
        min={studioLimits.opacityMin}
        max={studioLimits.opacityMax}
        disabled={disabled}
        onChange={setOpacity}
        onValueCommitted={(value) => patch({ field: "opacity", value })}
      />
      <fieldset>
        <legend>{t.showIn}</legend>
        {(
          [
            ["practice", t.practice],
            ["qualifying", t.qualifying],
            ["race", t.race],
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            checked={item.showIn[key]}
            disabled={disabled}
            onCheckedChange={(value) =>
              patch({
                field: "showIn",
                value: { ...item.showIn, [key]: value === true },
              })
            }
          />
        ))}
      </fieldset>
      <Select
        label={t.offTrack}
        value={item.offTrack}
        disabled={disabled}
        options={[
          { value: "inherit", label: t.inherit },
          { value: "alwaysVisible", label: t.always },
          { value: "hide", label: t.offHide },
        ]}
        onChange={(value) => {
          if (
            value === "inherit" ||
            value === "alwaysVisible" ||
            value === "hide"
          )
            patch({ field: "offTrack", value });
        }}
      />
      <Button
        disabled={disabled}
        variant="danger"
        onClick={() => setRemoving(true)}
      >
        {t.remove}
      </Button>
      <Dialog.Root
        open={removing}
        onOpenChange={(open) => {
          if (!state.pending) setRemoving(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="v-backdrop" />
          <Dialog.Popup className="v-studio-remove">
            <Dialog.Title>{t.removeTitle}</Dialog.Title>
            <Dialog.Description>{t.removeHelp}</Dialog.Description>
            {state.failure && <p role="alert">{state.failure.message}</p>}
            <div>
              <Button
                disabled={state.pending}
                onClick={() => setRemoving(false)}
              >
                {t.cancel}
              </Button>
              <Button
                variant="danger"
                busy={state.pending}
                onClick={() => {
                  setRemoving(false);
                  void state
                    .execute({
                      method: "studio.remove",
                      id: item.id,
                      baseRevision: view.revision,
                    })
                    .then((value) => {
                      if (value) state.setSelected(null);
                    });
                }}
              >
                {t.remove}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
function Catalog({ onPlans }: { onPlans: () => void }) {
  const state = useStudio(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos"),
    [added, setAdded] = useState<string>();
  const view = state.view;
  if (!view) return null;
  const widgets = view.catalog.filter(
    (w) =>
      (category === "Todos" || category === w.category) &&
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
    <div className="v-studio-catalog">
      <SearchInput
        label={t.search}
        clearLabel={t.cancel}
        value={search}
        onChange={setSearch}
      />
      <div className="v-studio-categories">
        {studioCategories.map((value) => (
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
                      !widget.allowed
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
                      disabled={
                        state.pending ||
                        !widget.allowed ||
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
                      <WidgetThumb kind={widget.kind} />
                      <strong>
                        {!widget.allowed && <Icon name="lock" />}
                        {widget.name}
                      </strong>
                      <small>{widget.about}</small>
                    </button>
                  </Tooltip>
                ))}
              </fieldset>
            </section>
          ),
      )}
      {view.plan === "unverified" && <p>{t.verify}</p>}
      {view.catalog.some((w) => !w.allowed) && (
        <Button onClick={onPlans}>{t.plans}</Button>
      )}
      {added === view.revision && (
        <Callout
          title={t.added}
          actions={
            <Button
              disabled={state.pending}
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
