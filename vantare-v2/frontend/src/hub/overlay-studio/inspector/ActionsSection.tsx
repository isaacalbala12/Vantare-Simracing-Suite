import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { executeWidgetAction } from "../canvas/widget-actions";
import type { StudioCommand } from "../state/studio-command";

export type ActionsSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
  discardAll(): void;
};

export function buildRestoreDefaultsWidget(widget: WidgetInstanceV3): WidgetInstanceV3 {
  const definition = widgetTypeRegistry.get(widget.type);
  const defaults = definition.createDefault(widget.id);
  return {
    ...defaults,
    id: widget.id,
    layout: structuredClone(widget.layout),
  };
}

export function ActionsSection(props: ActionsSectionProps): React.ReactElement {
  const { widget, session, widgets, savedDocument, dispatch, selectWidget, discardAll } = props;

  const runAction = (actionId: "duplicate" | "delete") => {
    executeWidgetAction({
      actionId,
      session,
      widgetIds: [widget.id],
      widgets,
      savedDocument,
      dispatch,
      selectWidget,
      confirmDelete: (message) => window.confirm(message),
    });
  };

  return (
    <div data-testid="studio-inspector-section-actions" data-widget-id={widget.id}>
      <p className="osv3-inspector-field__hint">
        Restaura contenido, visual y comportamiento. Conserva ID y layout.
      </p>
      <div className="osv3-inspector-action-row">
        <button type="button" data-testid="studio-action-duplicate" onClick={() => runAction("duplicate")}>
          Duplicar
        </button>
        <button type="button" data-testid="studio-action-delete" onClick={() => runAction("delete")}>
          Eliminar
        </button>
        <button
          type="button"
          data-testid="studio-action-restore-defaults"
          onClick={() =>
            dispatch({
              type: "widget/restore-defaults",
              session,
              widgetIds: [widget.id],
              defaults: [buildRestoreDefaultsWidget(widget)],
            })
          }
        >
          Restaurar valores
        </button>
        <button type="button" data-testid="studio-action-discard-all" onClick={() => discardAll()}>
          Descartar todo
        </button>
      </div>
    </div>
  );
}