import { useEffect, useRef, useState } from "react";
import {
  studioCategories,
  studioLimits,
} from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { studioCatalogText as text } from "../../i18n/studio-catalog";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Callout, Keycap, Skeleton } from "../Data";
import { SearchInput } from "../Forms";
import { WindowDialog as Dialog } from "../WindowDialog";
import { catalogBlock, catalogGroups } from "./catalog-model";
import { WidgetThumb } from "./Widgets";
import "./studio-catalog.css";

export function CatalogDialog({
  open,
  onOpenChange,
  onPlans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlans: () => void;
}) {
  const state = useStudio();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const popup = useRef<HTMLDivElement>(null);
  const addedWhenOpened = useRef<string | undefined>(undefined);
  const latestAdded = useRef(state.added);
  latestAdded.current = state.added;
  const busy = useRef(false);
  useEffect(() => {
    if (open) {
      setSearch("");
      setCategory("");
      addedWhenOpened.current = latestAdded.current?.revision;
    }
  }, [open]);
  const view = state.view;
  const groups = view ? catalogGroups(view, search, category) : [];
  const groupNames = {
    suggested: t.kit,
    allowed: t.planWidgets,
    locked: view?.plan === "unverified" ? t.unverifiedTitle : t.proTitle,
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop v-studio-catalog-backdrop" />
        <Dialog.Popup
          ref={popup}
          className="v-dialog v-studio-catalog-dialog"
          initialFocus={() =>
            popup.current?.querySelector<HTMLInputElement>("input") ?? false
          }
          finalFocus={() => {
            const added = latestAdded.current;
            if (!added || added.revision === addedWhenOpened.current)
              return true;
            // The focus model selects/reveals the row. Restore it after the
            // dialog releases its focus trap rather than returning to Add.
            return (
              Array.from(
                document.querySelectorAll<HTMLElement>("[data-widget]"),
              ).find((row) => row.dataset.widget === added.id) ?? false
            );
          }}
        >
          <header>
            <div>
              <Dialog.Title>{t.catalog}</Dialog.Title>
              <Dialog.Description>{text.catalogHelp}</Dialog.Description>
            </div>
            <Dialog.Close
              render={<Button variant="ghost" />}
              aria-label={text.catalogClose}
            >
              <Icon name="x" />
            </Dialog.Close>
          </header>
          <div className="v-studio-catalog-tools">
            <div className="v-studio-catalog-search">
              <Icon name="search" />
              <SearchInput
                label={t.search}
                clearLabel={text.catalogClear}
                value={search}
                onChange={setSearch}
              />
            </div>
            <fieldset
              className="v-studio-catalog-categories"
              aria-label={text.catalogCategories}
            >
              {studioCategories.map((label, index) => (
                <Button
                  key={label}
                  size="sm"
                  variant="ghost"
                  aria-pressed={category === (index ? label : "")}
                  onClick={() => setCategory(index ? label : "")}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
          </div>
          <div className="v-studio-catalog-body" aria-busy={state.pending}>
            {!view && <Skeleton label={t.loading} />}
            {view && view.state !== "ready" && (
              <Callout title={text.catalogProtected} />
            )}
            {view && view.instances.length >= studioLimits.instances && (
              <Callout title={t.atLimit(studioLimits.instances)} />
            )}
            {state.failure && (
              <Callout tone="err" title={state.failure.message} />
            )}
            {view && !groups.some((group) => group.items.length) && (
              <p role="status">{t.noResults}</p>
            )}
            {view &&
              groups.map(
                (group) =>
                  group.items.length > 0 && (
                    <section key={group.id}>
                      <h3>{groupNames[group.id]}</h3>
                      <fieldset
                        className="v-studio-catalog-grid"
                        aria-label={groupNames[group.id]}
                      >
                        {group.items.map((widget) => {
                          const block = catalogBlock(
                            view,
                            widget,
                            state.pending,
                          );
                          const reason =
                            block === "limit"
                              ? t.atLimit(studioLimits.instances)
                              : block === "protected"
                                ? text.catalogProtected
                                : block === "pending"
                                  ? t.saving
                                  : block === "unverified"
                                    ? t.verify
                                    : block === "pro"
                                      ? text.catalogPro
                                      : block === "unavailable"
                                        ? text.catalogUnavailable
                                        : undefined;
                          return (
                            <button
                              key={widget.kind}
                              type="button"
                              className="v-studio-catalog-widget"
                              data-kind={widget.kind}
                              aria-label={`${t.addShort} ${widget.name}`}
                              aria-disabled={!!block}
                              aria-describedby={
                                block
                                  ? `studio-catalog-${widget.kind}-reason`
                                  : undefined
                              }
                              onKeyDown={(event) => {
                                const grid = event.currentTarget.closest(
                                  ".v-studio-catalog-grid",
                                );
                                const buttons = Array.from(
                                  grid?.querySelectorAll<HTMLButtonElement>(
                                    "[data-kind]",
                                  ) ?? [],
                                );
                                const index = buttons.indexOf(
                                  event.currentTarget,
                                );
                                const columns = Math.max(
                                  1,
                                  grid
                                    ? getComputedStyle(grid)
                                        .gridTemplateColumns.split(/\s+/)
                                        .filter(
                                          (value) => value && value !== "none",
                                        ).length
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
                                    (index + step + buttons.length) %
                                      buttons.length
                                  ]?.focus();
                                }
                              }}
                              onClick={async () => {
                                if (block || busy.current) return;
                                busy.current = true;
                                try {
                                  await state.execute({
                                    method: "studio.add",
                                    kind: widget.kind,
                                    baseRevision: view.revision,
                                  });
                                } finally {
                                  busy.current = false;
                                }
                              }}
                            >
                              <span className="v-studio-catalog-preview">
                                <WidgetThumb kind={widget.kind} />
                              </span>
                              <strong>
                                {widget.name}
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
                              </strong>
                              <small>{widget.about}</small>
                              {!widget.allowed ? (
                                <span className="v-studio-catalog-badge">
                                  <Icon name="lock" />
                                  {view.plan === "unverified"
                                    ? t.unverified
                                    : text.catalogPro}
                                </span>
                              ) : (
                                <span
                                  className="v-studio-catalog-add"
                                  aria-hidden="true"
                                >
                                  <Icon name="plus" />
                                  {t.addShort}
                                </span>
                              )}
                              {reason && (
                                <span
                                  className="v-studio-catalog-reason"
                                  id={`studio-catalog-${widget.kind}-reason`}
                                >
                                  {reason}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </fieldset>
                    </section>
                  ),
              )}
          </div>
          <footer>
            <span className="v-studio-catalog-plan">
              {view?.plan === "unverified"
                ? t.verify
                : view?.catalog.some((widget) => !widget.allowed)
                  ? t.planNote(
                      t.planNames[view.plan],
                      text.catalogIncludedCount(
                        view.catalog.filter((widget) => widget.allowed).length,
                      ),
                      view.catalog.filter((widget) => !widget.allowed).length,
                    )
                  : view
                    ? text.catalogAllIncluded(
                        t.planNames[view.plan],
                        view.catalog.length,
                      )
                    : null}
            </span>
            {view?.catalog.some((widget) => !widget.allowed) && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onPlans();
                }}
              >
                {t.plans}
              </Button>
            )}
            <span className="v-studio-catalog-keys">
              <Keycap>{text.catalogMoveKeys}</Keycap>
              {text.catalogMove}
              <Keycap>{text.catalogEnterKey}</Keycap>
              {text.catalogKeyAdd}
              <Keycap>{text.catalogEscapeKey}</Keycap>
              {text.catalogKeyClose}
            </span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
