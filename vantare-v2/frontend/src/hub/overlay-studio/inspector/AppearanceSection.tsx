import { useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { designSystemRegistry } from '../../../overlay/core/design-system-registry';
import type { InspectorControl } from '../../../overlay/core/inspector-control';
import {
  clearControlValue,
  hasControlValue,
  writeControlValue,
} from '../../../overlay/core/inspector-control';
import type { SessionLayoutType, WidgetInstanceV3 } from '../../../overlay/core/profile-document';
import {
  mergeVisualSettings,
  migrateWidgetBaseSettings,
} from '../../../overlay/core/widget-visual-settings';
import { Button } from '../../../ui/orbit';
import type { StudioCommand } from '../state/studio-command';
import { InspectorControlField } from './inspector-control-field';

export type AppearanceSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  dispatch(command: StudioCommand): void;
};

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-studio-ins__sub-chev"
      fill="none"
      focusable="false"
      height={12}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 14 14"
      width={12}
    >
      <path d="M3 5.25 7 9.25l4-4" />
    </svg>
  );
}

export function AppearanceSection(props: AppearanceSectionProps): React.ReactElement {
  const { widget, session, dispatch } = props;
  const { t } = useI18n();
  const [colorsOpen, setColorsOpen] = useState(true);

  const registration = designSystemRegistry.resolve(
    widget.visual.systemId,
    widget.visual.systemVersion,
    widget.type,
  );
  const mergedSettings = mergeVisualSettings(
    migrateWidgetBaseSettings(widget),
    widget.visual.appearanceOverrides,
  );

  const overrides = widget.visual.appearanceOverrides ?? {};
  const controls = registration.inspector.appearance;
  // Los colores van juntos en su propio bloque: sueltos entre los interruptores
  // eran seis barras seguidas sin jerarquia (analisis del inspector Orbit).
  const colorControls = controls.filter((control) => control.kind === 'color');
  const otherControls = controls.filter((control) => control.kind !== 'color');

  const writeOverrides = (next: Record<string, unknown>) => {
    dispatch({
      type: 'widget/visual',
      session,
      widgetIds: [widget.id],
      visual: { ...widget.visual, appearanceOverrides: next },
    });
  };

  const renderControl = (control: InspectorControl) => (
    <InspectorControlField
      control={control}
      key={control.id}
      modified={hasControlValue(overrides, control.path)}
      onChange={(value) =>
        writeOverrides(
          writeControlValue(structuredClone(overrides), control.path, value),
        )
      }
      onReset={() =>
        writeOverrides(
          clearControlValue(structuredClone(overrides), control.path),
        )
      }
      values={mergedSettings}
    />
  );

  const changedCount = controls.filter((control) =>
    hasControlValue(overrides, control.path),
  ).length;
  const changedColors = colorControls.filter((control) =>
    hasControlValue(overrides, control.path),
  ).length;

  return (
    <div
      className="orbit-studio-ins__body"
      data-testid="studio-inspector-section-appearance"
      data-widget-id={widget.id}
    >
      {otherControls.length > 0 ? (
        <div className="orbit-studio-ins__stack">{otherControls.map(renderControl)}</div>
      ) : null}

      {colorControls.length > 0 ? (
        <details
          className="orbit-studio-ins__sub"
          data-testid="studio-inspector-appearance-colors"
          onToggle={(event) => setColorsOpen((event.currentTarget as HTMLDetailsElement).open)}
          open={colorsOpen}
        >
          <summary aria-expanded={colorsOpen}>
            <span className="orbit-studio-ins__sub-title">
              {t('studio.inspector.appearance.colors')}
            </span>
            <span className="orbit-studio-ins__sub-sum">
              {changedColors === 0
                ? String(colorControls.length)
                : changedColors === 1
                  ? t('studio.inspector.appearance.changedShortOne')
                  : t('studio.inspector.appearance.changedShort').replace(
                      '{{n}}',
                      String(changedColors),
                    )}
            </span>
            <Chevron />
          </summary>
          <div className="orbit-studio-ins__sub-body">{colorControls.map(renderControl)}</div>
        </details>
      ) : null}

      {changedCount > 0 ? (
        <div className="orbit-studio-ins__row">
          <Button
            data-testid="studio-appearance-reset-all"
            onClick={() => writeOverrides({})}
            size="sm"
            variant="ghost"
          >
            {t('studio.inspector.appearance.resetAll')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
