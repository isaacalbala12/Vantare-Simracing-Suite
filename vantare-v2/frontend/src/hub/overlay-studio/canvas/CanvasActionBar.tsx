import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { useI18n } from "../../../i18n/I18nProvider";
import type { StudioCommand } from "../state/studio-command";
import {
  executeWidgetAction,
  type WidgetActionId,
} from "./widget-actions";

const ACTION_ITEMS: readonly { id: WidgetActionId; labelKey: string }[] = [
  { id: "duplicate", labelKey: "studio.v3.widgetActions.duplicate" },
  { id: "delete", labelKey: "studio.v3.widgetActions.delete" },
  { id: "center", labelKey: "studio.v3.widgetActions.center" },
  { id: "reset-layout", labelKey: "studio.v3.widgetActions.resetLayout" },
  { id: "front", labelKey: "studio.v3.widgetActions.front" },
  { id: "forward", labelKey: "studio.v3.widgetActions.forward" },
  { id: "backward", labelKey: "studio.v3.widgetActions.backward" },
  { id: "back", labelKey: "studio.v3.widgetActions.back" },
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
  const { t } = useI18n();

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
                    deleteMessage: t("studio.v3.widgetActions.deleteConfirm"),
                  })
          }
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}
