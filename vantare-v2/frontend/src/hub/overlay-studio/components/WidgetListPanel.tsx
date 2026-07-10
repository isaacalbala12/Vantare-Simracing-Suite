import { useMemo, useState } from "react";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import type { CoreWidgetType } from "../../../overlay/core/profile-document";
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

export function WidgetListPanel(): React.ReactElement {
  const { access, activeLayout, activeSession, selectedWidgetId, dispatch, selectWidget } = useStudioDocument();
  const [query, setQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  const handleAddWidget = (type: CoreWidgetType) => {
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
      <input
        type="search"
        data-testid="studio-widget-search"
        className="osv3-list-panel__search"
        placeholder="Buscar widgets..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar widgets"
      />
      <div className="osv3-list-panel__list">
        {widgets.map((widget) => {
          const selected = widget.id === selectedWidgetId;
          return (
            <button
              key={widget.id}
              type="button"
              data-testid={`studio-widget-row-${widget.id}`}
              data-widget-id={widget.id}
              className={`osv3-list-panel__row${selected ? " osv3-list-panel__row--selected" : ""}`}
              onClick={() => selectWidget(widget.id)}
            >
              <span>{widgetLabel(widget)}</span>
              <span className="osv3-list-panel__badge">
                {widget.behavior.enabled ? "activo" : "oculto"} · {widget.visual.systemId}
              </span>
            </button>
          );
        })}
      </div>
      {(activeLayout?.preservedWidgets?.length ?? 0) > 0 ? (
        <div className="osv3-list-panel__preserved" data-testid="studio-preserved-widgets">
          <div className="osv3-list-panel__preserved-title">Widgets legados preservados</div>
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
          + Añadir widget
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