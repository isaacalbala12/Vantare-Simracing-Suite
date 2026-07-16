import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import type { WidgetType } from "../../../overlay/core/profile-document";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { AddWidgetDialog } from "../catalog/AddWidgetDialog";
import { buildAddWidgetCommand } from "../catalog/studio-catalog";
import { useStudioDocument } from "../state/studio-store";

function sortWidgets(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

function widgetLabel(widget: WidgetInstanceV3): string {
  return widget.name?.trim() || widget.id;
}

function WidgetTypeIcon({ type }: { type: WidgetType }): React.ReactElement {
  const path = (() => {
    switch (type) {
      case "delta":
      case "delta-advanced":
        return <><path d="M3 15l4-4 4 3 5-7 5 3" /><path d="M16 7h5v5" /></>;
      case "standings":
      case "broadcast-tower":
        return <><path d="M5 5h14M5 12h14M5 19h14" /><path d="M8 3v4M12 10v4M16 17v4" /></>;
      case "relative":
      case "multiclass-relative":
      case "head-to-head":
        return <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="16" r="2.5" /><path d="M10 8h7l-2-2m-5 10H7l2 2" /></>;
      case "pedals":
      case "pedals-telemetry":
      case "pedals-telemetry-compact":
      case "input-telemetry":
        return <><path d="M6 19V9m6 10V5m6 14v-7" /><path d="M3 19h18" /></>;
      case "racing-flags":
        return <><path d="M5 21V4" /><path d="M5 5h11l-2 4 2 4H5" /></>;
      default:
        return <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12h8M12 8v8" /></>;
    }
  })();

  return (
    <span className="osv3-list-panel__row-icon" data-widget-type={type} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </span>
  );
}

export function WidgetListPanel(): React.ReactElement {
  const { access, activeLayout, activeSession, selectedWidgetId, dispatch, selectWidget } = useStudioDocument();
  const [query, setQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { t } = useI18n();

  const widgets = useMemo(() => {
    const ordered = sortWidgets(activeLayout?.widgets ?? []);
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return ordered;
    }
    return ordered.filter((widget) => {
      const haystack = `${widgetLabel(widget)} ${widget.type} ${widget.id}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeLayout?.widgets, query]);

  const handleAddWidget = (type: WidgetType) => {
    const definition = widgetTypeRegistry.get(type);
    const command = buildAddWidgetCommand({
      session: activeSession,
      type,
      widgets: activeLayout?.widgets ?? [],
      definition,
    });
    dispatch(command);
    if (command.type === "widget/add") {
      selectWidget(command.widget.id);
    }
    setAddDialogOpen(false);
  };

  return (
    <aside className="osv3-list-panel" data-testid="studio-widget-list-panel">
      <div className="osv3-list-panel__header">
        <div className="osv3-list-panel__heading">
          <span className="osv3-list-panel__title" data-testid="studio-widget-list-title">
            {t("studio.v3.layout.widgetsPanel")}
          </span>
          <span className="osv3-list-panel__count" data-testid="studio-widget-count">{widgets.length}</span>
        </div>
        <div className="osv3-list-panel__search-wrap">
          <span className="osv3-list-panel__search-icon" aria-hidden="true" />
          <input
            type="search"
            data-testid="studio-widget-search"
            className="osv3-list-panel__search"
            placeholder={t("studio.v3.widgetList.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("studio.v3.widgetList.searchAria")}
          />
        </div>
      </div>
      <div className="osv3-list-panel__list">
        {widgets.map((widget) => {
          const selected = widget.id === selectedWidgetId;
          return (
            <button
              key={widget.id}
              type="button"
              data-testid={`studio-widget-row-${widget.id}`}
              data-widget-id={widget.id}
              data-enabled={widget.behavior.enabled ? "true" : "false"}
              className={`osv3-list-panel__row${selected ? " osv3-list-panel__row--selected" : ""}`}
              onClick={() => selectWidget(widget.id)}
            >
              <WidgetTypeIcon type={widget.type} />
              <span className="osv3-list-panel__row-name">{widgetLabel(widget)}</span>
              <span
                className="osv3-list-panel__badge"
                title={`${widget.behavior.enabled ? t("studio.v3.widgetList.status.active") : t("studio.v3.widgetList.status.hidden")} · ${widget.visual.systemId}`}
              >
                {widget.behavior.enabled ? t("studio.v3.widgetList.status.active") : t("studio.v3.widgetList.status.hidden")} · {widget.visual.systemId}
              </span>
            </button>
          );
        })}
      </div>
      {(activeLayout?.preservedWidgets?.length ?? 0) > 0 ? (
        <div className="osv3-list-panel__preserved" data-testid="studio-preserved-widgets">
          <div className="osv3-list-panel__preserved-title">{t("studio.v3.widgetList.preservedTitle")}</div>
          {activeLayout?.preservedWidgets?.map((widget) => (
            <div key={widget.id} className="osv3-list-panel__preserved-row" data-preserved-id={widget.id}>
              {widget.type} · {widget.id}
            </div>
          ))}
        </div>
      ) : null}
      <div className="osv3-list-panel__footer">
        <button
          type="button"
          data-testid="studio-show-add-widget"
          className="osv3-list-panel__add"
          onClick={() => setAddDialogOpen(true)}
        >
          {t("studio.v3.widgetList.addWidget")}
        </button>
      </div>
      <AddWidgetDialog
        open={addDialogOpen}
        access={access}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddWidget}
      />
    </aside>
  );
}
