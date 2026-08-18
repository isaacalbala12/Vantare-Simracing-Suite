import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { resolveLayoutViewport } from "../../../overlay/core/layout-viewport";
import type { WidgetInstanceV3, WidgetType } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { Button, Input, ListRow } from "../../../ui/orbit";
import { AddWidgetDialog } from "../catalog/AddWidgetDialog";
import { buildAddWidgetCommand } from "../catalog/studio-catalog";
import { useStudioDocument } from "../state/studio-store";
import { fill, systemLabel, widgetLabel } from "./studio-orbit-model";

/** Tirador de arrastre del prototipo (`.witem .grip`). */
function Grip() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-studio-witem__grip"
      fill="none"
      focusable="false"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 14 14"
      width={14}
    >
      <path d="M5 3.2h.01M9 3.2h.01M5 7h.01M9 7h.01M5 10.8h.01M9 10.8h.01" />
    </svg>
  );
}

/** Cruz del boton de anadir widget (`.dock-foot .btn` del prototipo). */
function Plus() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-studio-wlist__plus"
      fill="none"
      focusable="false"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 14 14"
      width={14}
    >
      <path d="M7 2.5v9M2.5 7h9" />
    </svg>
  );
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.4}
      viewBox="0 0 16 16"
      width={15}
    >
      <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4Z" />
      <circle cx="8" cy="8" r="1.8" />
      {open ? null : <path d="M3 13 13 3" />}
    </svg>
  );
}

function sortWidgets(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

/**
 * Lista de widgets de la columna contextual (`15-briefings/04-studio.md`).
 *
 * Es la misma lista que `WidgetListPanel` —mismo store, mismo orden, mismo
 * filtro y el mismo dialogo de catalogo— vestida con el kit Orbit. El ojo no va
 * dentro del `ListRow` sino a su lado: un boton dentro de otro boton no es
 * navegable con teclado (`08-accesibilidad.md`).
 */
export function StudioWidgetList(): React.ReactElement {
  const { access, document, activeLayout, activeSession, selectedWidgetId, dispatch, selectWidget } =
    useStudioDocument();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const widgets = useMemo(() => {
    const ordered = sortWidgets(activeLayout?.widgets ?? []);
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return ordered;
    }
    return ordered.filter((widget) =>
      `${widgetLabel(widget)} ${widget.type} ${widget.id}`.toLowerCase().includes(normalized),
    );
  }, [activeLayout?.widgets, query]);

  const handleAddWidget = (type: WidgetType) => {
    const definition = widgetTypeRegistry.get(type);
    const command = buildAddWidgetCommand({
      session: activeSession,
      type,
      widgets: activeLayout?.widgets ?? [],
      definition,
      layoutViewport: resolveLayoutViewport(document ?? {}),
    });
    dispatch(command);
    if (command.type === "widget/add") {
      selectWidget(command.widget.id);
    }
    setAddDialogOpen(false);
  };

  return (
    <div className="orbit-studio-wlist" data-testid="orbit-studio-widget-list">
      <div className="orbit-studio-wlist__head">
        <span className="orbit-eyebrow">{t("studio.column.eyebrow")}</span>
        <span className="orbit-studio-wlist__count" data-testid="orbit-studio-widget-count">
          {widgets.length}
        </span>
      </div>

      <Input
        aria-label={t("studio.column.searchAria")}
        className="orbit-studio-wlist__search"
        data-testid="orbit-studio-widget-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("studio.column.search")}
        type="search"
        value={query}
      />

      <div aria-label={t("studio.column.listAria")} className="orbit-studio-wlist__items" role="list">
        {widgets.length === 0 ? (
          <p className="orbit-studio-wlist__empty">{t("studio.column.empty")}</p>
        ) : null}
        {widgets.map((widget) => {
          const enabled = widget.behavior.enabled;
          const name = widgetLabel(widget);
          return (
            <div
              className="orbit-studio-witem"
              data-enabled={enabled ? "true" : "false"}
              data-testid={`orbit-studio-widget-item-${widget.id}`}
              data-widget-id={widget.id}
              key={widget.id}
              role="listitem"
            >
              <ListRow
                ariaSelected={widget.id === selectedWidgetId}
                className="orbit-studio-witem__row"
                leading={<Grip />}
                onClick={() => selectWidget(widget.id)}
                role="option"
                selected={widget.id === selectedWidgetId}
                subtitle={`${enabled ? t("studio.column.status.active") : t("studio.column.status.hidden")} · ${systemLabel(widget, t)}`}
                title={name}
              />
              <button
                aria-label={fill(t(enabled ? "studio.column.hide" : "studio.column.show"), { name })}
                aria-pressed={!enabled}
                className="orbit-studio-witem__eye"
                data-testid={`orbit-studio-widget-eye-${widget.id}`}
                data-tip={fill(t(enabled ? "studio.column.hide" : "studio.column.show"), { name })}
                data-tip-side="top"
                onClick={() =>
                  dispatch({
                    type: "widget/behavior",
                    session: activeSession,
                    widgetIds: [widget.id],
                    patch: { enabled: !enabled },
                  })
                }
                type="button"
              >
                <Eye open={enabled} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="orbit-studio-wlist__foot">
        <Button
          data-testid="orbit-studio-widget-add"
          onClick={() => setAddDialogOpen(true)}
          variant="ghost"
        >
          <Plus />
          {t("studio.column.add")}
        </Button>
      </div>

      <AddWidgetDialog
        access={access}
        onAdd={handleAddWidget}
        onClose={() => setAddDialogOpen(false)}
        open={addDialogOpen}
        unavailableTypes={
          (activeLayout?.widgets ?? []).some((widget) => widget.type === "delta") ? ["delta"] : []
        }
      />
    </div>
  );
}
