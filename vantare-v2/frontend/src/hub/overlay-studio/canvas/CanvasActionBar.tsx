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
};

export function CanvasActionBar(props: CanvasActionBarProps): React.ReactElement {
  return (
    <div data-testid="studio-canvas-action-bar" className="osv3-canvas-action-bar">
      {ACTION_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`studio-action-${item.id}`}
          className="osv3-canvas-action-bar__button"
          onClick={() =>
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