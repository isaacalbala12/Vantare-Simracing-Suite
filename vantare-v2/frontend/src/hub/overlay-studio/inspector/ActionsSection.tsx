import type {
  ProfileDocumentV3,
  SessionLayoutType,
  WidgetInstanceV3,
} from '../../../overlay/core/profile-document';
import { widgetTypeRegistry } from '../../../overlay/core/widget-registry';
import { useI18n } from '../../../i18n/I18nProvider';
import { Button } from '../../../ui/orbit';
import { useDeleteWidgetConfirm } from '../components/studio-confirm';
import type { StudioCommand } from '../state/studio-command';

export type ActionsSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
  discardAll(): void;
};

function buildRestoreDefaultsWidget(widget: WidgetInstanceV3): WidgetInstanceV3 {
  const definition = widgetTypeRegistry.get(widget.type);
  const defaults = definition.createDefault(widget.id);
  return {
    ...defaults,
    id: widget.id,
    layout: structuredClone(widget.layout),
  };
}

export function ActionsSection(props: ActionsSectionProps): React.ReactElement {
  const { widget, session, dispatch, discardAll } = props;
  const { t } = useI18n();
  const deleteConfirm = useDeleteWidgetConfirm();

  const restoreDefaults = () =>
    dispatch({
      type: 'widget/restore-defaults',
      session,
      widgetIds: [widget.id],
      defaults: [buildRestoreDefaultsWidget(widget)],
    });

  {
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
            {t('studio.inspector.actions.restoreDefaults')}
          </Button>
          <Button
            data-testid="studio-action-discard-all"
            onClick={() => discardAll()}
            size="sm"
            variant="ghost"
          >
            {t('studio.inspector.actions.discardAll')}
          </Button>
        </div>
        <p className="orbit-studio-ins__hint">{t('studio.inspector.actions.restoreHint')}</p>
        {deleteConfirm && !deleteConfirm.enabled ? (
          <Button
            data-testid="studio-action-restore-delete-confirm"
            onClick={() => deleteConfirm.setEnabled(true)}
            size="sm"
            variant="ghost"
          >
            {t('studio.v3.deleteWidget.restore')}
          </Button>
        ) : null}
      </div>
    );
  }
}
