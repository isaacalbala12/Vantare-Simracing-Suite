import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { executeWidgetAction } from "../canvas/widget-actions";
import type { StudioCommand } from "../state/studio-command";

export type LayoutSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
};

export function LayoutSection(props: LayoutSectionProps): React.ReactElement {
  const { widget, session, widgets, savedDocument, dispatch, selectWidget } = props;
  const definition = widgetTypeRegistry.get(widget.type);
  const canUnlock = definition.capabilities.supportsAspectUnlock;

  const runAction = (actionId: "center" | "reset-layout" | "front" | "forward" | "backward" | "back") => {
    executeWidgetAction({
      actionId,
      session,
      widgetIds: [widget.id],
      widgets,
      savedDocument,
      dispatch,
      selectWidget,
    });
  };

  return (
    <div data-testid="studio-inspector-section-layout" data-widget-id={widget.id}>
      <label className="osv3-inspector-field">
        <span className="osv3-inspector-field__label">Bloquear proporción</span>
        <input
          type="checkbox"
          data-testid="studio-layout-aspect-lock"
          checked={widget.layout.aspectLocked}
          disabled={!canUnlock}
          onChange={(event) =>
            dispatch({
              type: "widget/layout",
              session,
              widgetIds: [widget.id],
              patch: { aspectLocked: event.target.checked },
            })
          }
        />
        {!canUnlock ? (
          <p className="osv3-inspector-field__hint" data-testid="studio-layout-aspect-lock-hint">
            Este widget mantiene su proporción fija.
          </p>
        ) : null}
      </label>

      <div className="osv3-inspector-action-row">
        <button type="button" data-testid="studio-layout-center" onClick={() => runAction("center")}>
          Centrar
        </button>
        <button type="button" data-testid="studio-layout-reset" onClick={() => runAction("reset-layout")}>
          Restablecer layout
        </button>
      </div>

      <div className="osv3-inspector-action-row" data-testid="studio-layout-z-order">
        <button type="button" data-testid="studio-layout-front" onClick={() => runAction("front")}>
          Al frente
        </button>
        <button type="button" data-testid="studio-layout-forward" onClick={() => runAction("forward")}>
          Adelante
        </button>
        <button type="button" data-testid="studio-layout-backward" onClick={() => runAction("backward")}>
          Atrás
        </button>
        <button type="button" data-testid="studio-layout-back" onClick={() => runAction("back")}>
          Al fondo
        </button>
      </div>
    </div>
  );
}