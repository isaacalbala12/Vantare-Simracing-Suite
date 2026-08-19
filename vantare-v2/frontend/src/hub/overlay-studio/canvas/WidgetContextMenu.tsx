import { useEffect, useRef } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import type {
  ProfileDocumentV3,
  SessionLayoutType,
  WidgetInstanceV3,
} from '../../../overlay/core/profile-document';
import type { LayoutViewport } from '../../../overlay/core/layout-viewport';
import { useDeleteWidgetConfirm } from '../components/studio-confirm';
import type { StudioCommand } from '../state/studio-command';
import { executeWidgetAction, type WidgetActionId } from './widget-actions';

const MENU_ACTIONS: readonly { id: WidgetActionId; labelKey: string }[] = [
  { id: 'duplicate', labelKey: 'studio.v3.widgetActions.duplicate' },
  { id: 'delete', labelKey: 'studio.v3.widgetActions.delete' },
  { id: 'center', labelKey: 'studio.v3.widgetActions.center' },
  { id: 'reset-layout', labelKey: 'studio.v3.widgetActions.resetLayout' },
  { id: 'front', labelKey: 'studio.v3.widgetActions.front' },
  { id: 'forward', labelKey: 'studio.v3.widgetActions.forward' },
  { id: 'backward', labelKey: 'studio.v3.widgetActions.backward' },
  { id: 'back', labelKey: 'studio.v3.widgetActions.back' },
];

export type WidgetContextMenuState = {
  x: number;
  y: number;
  widgetId: string;
  layerWidgetIds: readonly string[];
};

export type WidgetContextMenuProps = {
  menu: WidgetContextMenuState | null;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  layoutViewport: LayoutViewport;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
  confirmDelete?(message: string): boolean;
  onClose(): void;
};

export function WidgetContextMenu(props: WidgetContextMenuProps): React.ReactElement | null {
  const { menu, onClose } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const deleteConfirm = useDeleteWidgetConfirm();

  useEffect(() => {
    if (!menu) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, onClose]);

  if (!props.menu) {
    return null;
  }

  const runAction = (actionId: WidgetActionId, widgetIds: readonly string[]) => {
    executeWidgetAction({
      actionId,
      session: props.session,
      widgetIds,
      widgets: props.widgets,
      savedDocument: props.savedDocument,
      layoutViewport: props.layoutViewport,
      dispatch: props.dispatch,
      selectWidget: props.selectWidget,
      confirmDelete: props.confirmDelete,
      requestDeleteConfirm: deleteConfirm?.request,
      deleteMessage: t('studio.v3.widgetActions.deleteConfirm'),
    });
    props.onClose();
  };

  return (
    <div
      ref={panelRef}
      data-testid="studio-widget-context-menu"
      className="osv3-widget-context-menu"
      style={{ left: `${props.menu.x}px`, top: `${props.menu.y}px` }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {MENU_ACTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`studio-context-action-${item.id}`}
          className="osv3-widget-context-menu__item"
          onClick={() => runAction(item.id, [props.menu!.widgetId])}
        >
          {t(item.labelKey)}
        </button>
      ))}
      {props.menu.layerWidgetIds.length > 1 ? (
        <div
          data-testid="studio-context-layer-submenu"
          className="osv3-widget-context-menu__submenu"
        >
          <div className="osv3-widget-context-menu__submenu-title">
            {t('studio.v3.contextMenu.selectLayer')}
          </div>
          {props.menu.layerWidgetIds.map((widgetId) => {
            const widget = props.widgets.find((entry) => entry.id === widgetId);
            return (
              <button
                key={widgetId}
                type="button"
                role="menuitem"
                data-testid={`studio-context-layer-${widgetId}`}
                className="osv3-widget-context-menu__item"
                onClick={() => {
                  props.selectWidget(widgetId);
                  props.onClose();
                }}
              >
                {widget?.name ?? widget?.type ?? widgetId}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
