import type {
  ProfileDocumentV3,
  SessionLayoutType,
  WidgetInstanceV3,
} from '../../../overlay/core/profile-document';
import type { LayoutViewport } from '../../../overlay/core/layout-viewport';
import { widgetTypeRegistry } from '../../../overlay/core/widget-registry';
import { useI18n } from '../../../i18n/I18nProvider';
import { Button, Field, Input, Toggle } from '../../../ui/orbit';
import { executeWidgetAction } from '../canvas/widget-actions';
import type { StudioCommand } from '../state/studio-command';

/** Campos numericos X/Y/W/H de la fila de 4 del inspector Orbit. */
const LAYOUT_FIELDS = [
  { key: 'x', labelKey: 'studio.inspector.layout.x', ariaKey: 'studio.inspector.layout.xAria' },
  { key: 'y', labelKey: 'studio.inspector.layout.y', ariaKey: 'studio.inspector.layout.yAria' },
  { key: 'w', labelKey: 'studio.inspector.layout.w', ariaKey: 'studio.inspector.layout.wAria' },
  { key: 'h', labelKey: 'studio.inspector.layout.h', ariaKey: 'studio.inspector.layout.hAria' },
] as const;

export type LayoutSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  layoutViewport: LayoutViewport;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
};

export function LayoutSection(props: LayoutSectionProps): React.ReactElement {
  const { widget, session, widgets, savedDocument, layoutViewport, dispatch, selectWidget } = props;
  const { t } = useI18n();
  const definition = widgetTypeRegistry.get(widget.type);
  const canUnlock = definition.capabilities.supportsAspectUnlock;

  const setAspectLocked = (aspectLocked: boolean) =>
    dispatch({
      type: 'widget/layout',
      session,
      widgetIds: [widget.id],
      patch: { aspectLocked },
    });

  /** Commit de X/Y/W/H: descarta lo que no sea un numero finito. */
  const commitLayoutField = (key: 'x' | 'y' | 'w' | 'h', raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed === widget.layout[key]) {
      return;
    }
    dispatch({
      type: 'widget/layout',
      session,
      widgetIds: [widget.id],
      patch: { [key]: Math.round(parsed) },
    });
  };

  const runAction = (
    actionId: 'center' | 'reset-layout' | 'front' | 'forward' | 'backward' | 'back',
  ) => {
    executeWidgetAction({
      actionId,
      session,
      widgetIds: [widget.id],
      widgets,
      savedDocument,
      layoutViewport,
      dispatch,
      selectWidget,
    });
  };

  {
    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-layout"
        data-widget-id={widget.id}
      >
        <div className="orbit-studio-ins__grid4">
          {LAYOUT_FIELDS.map((field) => {
            const current = Math.round(widget.layout[field.key]);
            return (
              <label className="orbit-studio-ins__num" key={field.key}>
                <span>{t(field.labelKey)}</span>
                <Input
                  aria-label={t(field.ariaKey)}
                  data-testid={`studio-layout-${field.key}`}
                  defaultValue={current}
                  inputMode="numeric"
                  // Se remonta cuando el lienzo mueve el widget: asi el campo
                  // refleja el arrastre sin pelearse con lo que estas tecleando.
                  key={`${widget.id}-${field.key}-${current}`}
                  numeric
                  onBlur={(event) => commitLayoutField(field.key, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitLayoutField(field.key, event.currentTarget.value);
                    }
                  }}
                />
              </label>
            );
          })}
        </div>

        <Field
          hint={
            canUnlock
              ? t('studio.inspector.layout.aspectHint')
              : t('studio.v3.layout.aspectLockFixedHint')
          }
          label={t('studio.v3.layout.aspectLock')}
          row
        >
          <Toggle
            disabled={!canUnlock}
            label={t('studio.v3.layout.aspectLock')}
            onChange={setAspectLocked}
            pressed={widget.layout.aspectLocked}
          />
        </Field>

        <Field label={t('studio.inspector.layout.order')}>
          <div className="orbit-studio-ins__row" data-testid="studio-layout-z-order">
            <Button
              data-testid="studio-layout-front"
              onClick={() => runAction('front')}
              size="sm"
              variant="ghost"
            >
              {t('studio.v3.layout.zOrder.front')}
            </Button>
            <Button
              data-testid="studio-layout-back"
              onClick={() => runAction('back')}
              size="sm"
              variant="ghost"
            >
              {t('studio.v3.layout.zOrder.back')}
            </Button>
            <Button
              data-testid="studio-layout-center"
              onClick={() => runAction('center')}
              size="sm"
              variant="ghost"
            >
              {t('studio.v3.layout.center')}
            </Button>
            <Button
              data-testid="studio-layout-reset"
              onClick={() => runAction('reset-layout')}
              size="sm"
              variant="ghost"
            >
              {t('studio.inspector.layout.reset')}
            </Button>
          </div>
        </Field>
      </div>
    );
  }
}
