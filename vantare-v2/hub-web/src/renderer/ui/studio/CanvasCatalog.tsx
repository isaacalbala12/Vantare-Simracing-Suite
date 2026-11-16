import { useEffect, useId, useRef, useState } from "react";
import {
  type StudioView,
  studioLimits,
} from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { studioCatalogText as text } from "../../i18n/studio-catalog";
import { studioDropText as drop } from "../../i18n/studio-drop";
import type { useCatalogInputs } from "../../screens/studio/catalog-inputs";
import { Button, IconButton } from "../Button";
import { SearchInput } from "../Forms";
import { catalogBlock, catalogGroups } from "./catalog-model";
import { WidgetThumb } from "./Widgets";
import "./studio-drop.css";

export function CanvasCatalog({
  view,
  enabled,
  pending,
  input,
  close,
}: {
  view: StudioView;
  enabled: boolean;
  pending: boolean;
  input: ReturnType<typeof useCatalogInputs>;
  close: () => void;
}) {
  const [search, setSearch] = useState("");
  const root = useRef<HTMLElement>(null),
    origin = useRef(document.activeElement);
  const id = useId();
  useEffect(() => {
    root.current?.querySelector("input")?.focus({ preventScroll: true });
    return () => {
      const node = origin.current;
      if (
        node instanceof HTMLElement &&
        node.isConnected &&
        (document.activeElement === document.body ||
          root.current?.contains(document.activeElement))
      )
        node.focus({ preventScroll: true });
    };
  }, []);
  const groups = catalogGroups(view, search, "");
  const names = {
    suggested: t.kit,
    allowed: t.planWidgets,
    locked: view.plan === "unverified" ? t.unverifiedTitle : t.proTitle,
  };
  return (
    <aside
      ref={root}
      className="v-canvas-catalog"
      aria-labelledby={`${id}-title`}
      data-dragging={!!input.visual}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.nativeEvent.isComposing &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <header>
        <h2 id={`${id}-title`}>{t.catalog}</h2>
        <IconButton label={text.catalogClose} variant="ghost" onClick={close}>
          <Icon name="x" />
        </IconButton>
      </header>
      <p>{drop.help}</p>
      <SearchInput
        label={t.search}
        clearLabel={text.catalogClear}
        value={search}
        onChange={setSearch}
      />
      {!enabled && <p role="status">{drop.readonly}</p>}
      <div className="v-canvas-catalog-list" aria-busy={pending}>
        {!groups.some((group) => group.items.length) && (
          <p role="status">{t.noResults}</p>
        )}
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <section key={group.id} aria-label={names[group.id]}>
                <h3>{names[group.id]}</h3>
                {group.items.map((widget) => {
                  const blocked = catalogBlock(view, widget, pending);
                  const reason =
                    blocked === "limit"
                      ? t.atLimit(studioLimits.instances)
                      : blocked === "unverified"
                        ? t.verifyWidget
                        : blocked === "pro"
                          ? text.catalogPro
                          : blocked === "unavailable"
                            ? text.catalogUnavailable
                            : blocked === "protected"
                              ? text.catalogProtected
                              : blocked === "pending"
                                ? t.saving
                                : !enabled
                                  ? drop.readonly
                                  : undefined;
                  return (
                    <article
                      className="v-canvas-catalog-card"
                      key={widget.kind}
                    >
                      <span aria-hidden="true">
                        <WidgetThumb kind={widget.kind} />
                      </span>
                      <div>
                        <strong id={`${id}-name-${widget.kind}`}>
                          {widget.name}
                        </strong>
                        <small id={`${id}-about-${widget.kind}`}>
                          {widget.about}
                        </small>
                        {reason && (
                          <small id={`${id}-${widget.kind}`}>{reason}</small>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="neutral"
                        onBlur={input.cancel}
                        aria-labelledby={`${id}-add-${widget.kind} ${id}-name-${widget.kind}`}
                        aria-disabled={!!reason}
                        aria-describedby={`${id}-about-${widget.kind}${reason ? ` ${id}-${widget.kind}` : ""}`}
                        onClick={(event) => {
                          if (!reason) input.click(event, widget.kind);
                        }}
                      >
                        <span id={`${id}-add-${widget.kind}`}>
                          {t.addShort}
                        </span>
                      </Button>
                      <span
                        aria-hidden="true"
                        className="v-canvas-catalog-grip"
                        aria-disabled={!!reason}
                        onClick={(event) => {
                          if (!reason) input.click(event, widget.kind);
                        }}
                        onPointerDown={(event) => {
                          if (
                            !reason &&
                            event.button === 0 &&
                            event.isPrimary
                          ) {
                            event.preventDefault();
                            event.currentTarget.parentElement
                              ?.querySelector<HTMLButtonElement>(".v-button")
                              ?.focus({ preventScroll: true });
                            input.pointerDown(event, widget.kind);
                          }
                        }}
                        onPointerMove={input.pointerMove}
                        onPointerUp={input.pointerUp}
                        onPointerCancel={input.pointerLost}
                        onLostPointerCapture={input.pointerLost}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          width="20"
                          height="20"
                          fill="currentColor"
                        >
                          <circle cx="7" cy="5" r="1.5" />
                          <circle cx="13" cy="5" r="1.5" />
                          <circle cx="7" cy="10" r="1.5" />
                          <circle cx="13" cy="10" r="1.5" />
                          <circle cx="7" cy="15" r="1.5" />
                          <circle cx="13" cy="15" r="1.5" />
                        </svg>
                      </span>
                    </article>
                  );
                })}
              </section>
            ),
        )}
      </div>
      <small id={`${id}-keys`}>{drop.dragHelp}</small>
    </aside>
  );
}
