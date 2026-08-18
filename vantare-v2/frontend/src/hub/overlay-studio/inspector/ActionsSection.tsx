import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { useI18n } from "../../../i18n/I18nProvider";
import { Button } from "../../../ui/orbit";
import { useDeleteWidgetConfirm } from "../components/StudioConfirmProvider";
import { executeWidgetAction } from "../canvas/widget-actions";
import type { StudioCommand } from "../state/studio-command";
import { useIsOrbitSkin } from "./inspector-skin";

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
  const { t } = useI18n();
  const orbit = useIsOrbitSkin();
  const deleteConfirm = useDeleteWidgetConfirm();

  const restoreDefaults = () =>
    dispatch({
      type: "widget/restore-defaults",
      session,
      widgetIds: [widget.id],
      defaults: [buildRestoreDefaultsWidget(widget)],
    });

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
      requestDeleteConfirm: deleteConfirm?.request,
      deleteMessage: t("studio.v3.widgetActions.deleteConfirm"),
    });
  };

  if (orbit) {
    // Duplicar y eliminar ya viven en la cabecera del inspector Orbit: aqui
    // solo quedan las dos acciones destructivas de restauracion.
    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-actions"
        data-widget-id={widget.id}
      >
        <div className="orbit-studio-ins__row">
          <Button
            data-testid="studio-action-restore-defaults"
            onClick={restoreDefaults}
            size="sm"
            variant="ghost"
          >
            {t("studio.inspector.actions.restoreDefaults")}
          </Button>
          <Button
            data-testid="studio-action-discard-all"
            onClick={() => discardAll()}
            size="sm"
            variant="ghost"
          >
            {t("studio.inspector.actions.discardAll")}
          </Button>
        </div>
        <p className="orbit-studio-ins__hint">{t("studio.inspector.actions.restoreHint")}</p>
        {deleteConfirm && !deleteConfirm.enabled ? (
          <Button
            data-testid="studio-action-restore-delete-confirm"
            onClick={() => deleteConfirm.setEnabled(true)}
            size="sm"
            variant="ghost"
          >
            {t("studio.v3.deleteWidget.restore")}
          </Button>
        ) : null}
      </div>
    );
  }

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
          onClick={restoreDefaults}
        >
          Restaurar valores
        </button>
        <button type="button" data-testid="studio-action-discard-all" onClick={() => discardAll()}>
          Descartar todo
        </button>
      </div>
      {/* Unica salida del "no volver a preguntar": sin esto la preferencia se
          guarda en localStorage y no hay forma de recuperar el aviso. */}
      {deleteConfirm && !deleteConfirm.enabled ? (
        <button
          type="button"
          data-testid="studio-action-restore-delete-confirm"
          className="osv3-inspector-field__hint osv3-inspector-restore-confirm"
          onClick={() => deleteConfirm.setEnabled(true)}
        >
          {t("studio.v3.deleteWidget.restore")}
        </button>
      ) : null}
    </div>
  );
}