import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioCommand } from "../state/studio-command";
import {
  executeWidgetAction,
  type WidgetActionId,
} from "./widget-actions";

const ACTION_ITEMS: readonly { id: WidgetActionId; label: string }[] = [
  { id: "duplicate", label: "Duplicar" },
  { id: "delete", label: "Eliminar" },
  { id: "center", label: "Centrar" },
  { id: "reset-layout", label: "Restablecer layout" },
  { id: "front", label: "Al frente" },
  { id: "forward", label: "Adelante" },
  { id: "backward", label: "Atrás" },
  { id: "back", label: "Al fondo" },
];

export type CanvasActionBarProps = {
  widgetId: string;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
  confirmDelete(message: string): boolean;
  inert?: boolean;
};

export function CanvasActionBar(props: CanvasActionBarProps): React.ReactElement {
  const { inert = false } = props;

  return (
    <div
      data-testid={inert ? "studio-canvas-action-bar-placeholder" : "studio-canvas-action-bar"}
      className={inert ? "osv3-canvas-action-bar osv3-canvas-action-bar--inert" : "osv3-canvas-action-bar"}
      aria-hidden={inert}
    >
      {ACTION_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={inert ? undefined : `studio-action-${item.id}`}
          className="osv3-canvas-action-bar__button"
          tabIndex={inert ? -1 : 0}
          disabled={inert}
          onClick={
            inert
              ? undefined
              : () =>
                  executeWidgetAction({
                    actionId: item.id,
                    session: props.session,
                    widgetIds: [props.widgetId],
                    widgets: props.widgets,
                    savedDocument: props.savedDocument,
                    dispatch: props.dispatch,
                    selectWidget: props.selectWidget,
                    confirmDelete: props.confirmDelete,
                  })
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}