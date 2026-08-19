import type {
  SessionLayoutType,
  WidgetInstanceV3,
  WidgetVisibilityV3,
} from '../../../overlay/core/profile-document';
import type { TelemetrySnapshot } from '../../../overlay/core/telemetry-snapshot';
import { isWidgetVisibleV3 } from '../../../overlay/core/widget-visibility';
import { useI18n } from '../../../i18n/I18nProvider';
import { Field, Note, SegMulti, Select } from '../../../ui/orbit';
import type { StudioCommand } from '../state/studio-command';

const UPDATE_HZ_PRESETS = [5, 10, 15, 30, 60] as const;
const SESSION_TYPE_OPTIONS = ['practice', 'qualifying', 'race', 'warmup', 'endurance'] as const;

type SessionTypeOption = (typeof SESSION_TYPE_OPTIONS)[number];
type PitOption = 'any' | 'in-pit' | 'on-track';

export type BehaviorSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  snapshot: TelemetrySnapshot;
  dispatch(command: StudioCommand): void;
};

function patchBehavior(
  widget: WidgetInstanceV3,
  session: SessionLayoutType,
  patch: Partial<WidgetInstanceV3['behavior']>,
  dispatch: BehaviorSectionProps['dispatch'],
): void {
  dispatch({
    type: 'widget/behavior',
    session,
    widgetIds: [widget.id],
    patch,
  });
}

export function BehaviorSection(props: BehaviorSectionProps): React.ReactElement {
  const { widget, session, snapshot, dispatch } = props;
  const { t } = useI18n();
  const runtimeVisible = isWidgetVisibleV3(widget, snapshot);

  const pitValue: PitOption =
    widget.behavior.visibleWhen?.inPit === undefined
      ? 'any'
      : widget.behavior.visibleWhen.inPit
        ? 'in-pit'
        : 'on-track';

  /** Unico punto de escritura de `visibleWhen.inPit` (lo comparten ambas pieles). */
  const setPit = (next: PitOption) => {
    const nextVisibleWhen: WidgetVisibilityV3 = { ...widget.behavior.visibleWhen };
    if (next === 'any') {
      delete nextVisibleWhen.inPit;
    } else {
      nextVisibleWhen.inPit = next === 'in-pit';
    }
    patchBehavior(widget, session, { visibleWhen: nextVisibleWhen }, dispatch);
  };

  /** Unico punto de escritura de `visibleWhen.sessionTypes`. */
  const toggleSession = (sessionType: SessionTypeOption, selected: boolean) => {
    const current = new Set(widget.behavior.visibleWhen?.sessionTypes ?? []);
    if (selected) {
      current.add(sessionType);
    } else {
      current.delete(sessionType);
    }
    const nextVisibleWhen: WidgetVisibilityV3 = {
      ...widget.behavior.visibleWhen,
      sessionTypes: [...current],
    };
    if (nextVisibleWhen.sessionTypes?.length === 0) {
      delete nextVisibleWhen.sessionTypes;
    }
    patchBehavior(widget, session, { visibleWhen: nextVisibleWhen }, dispatch);
  };

  const selectedSessions = widget.behavior.visibleWhen?.sessionTypes ?? [];

  {
    // El valor actual siempre esta en la lista aunque no sea un preset: el
    // `Select` no puede reescribir el documento por si solo.
    const hzOptions = [...new Set<number>([...UPDATE_HZ_PRESETS, widget.behavior.updateHz])].sort(
      (a, b) => a - b,
    );

    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-behavior"
        data-runtime-visible={runtimeVisible ? 'true' : 'false'}
        data-widget-id={widget.id}
      >
        <div className="orbit-studio-ins__grid2">
          <Field htmlFor="orbit-behavior-hz" label={t('studio.inspector.frequency')}>
            <Select
              id="orbit-behavior-hz"
              label={t('studio.inspector.frequency')}
              onChange={(next) => {
                const parsed = Number.parseInt(next, 10);
                patchBehavior(widget, session, { updateHz: parsed }, dispatch);
              }}
              options={hzOptions.map((hz) => ({ value: String(hz), label: String(hz) }))}
              value={String(widget.behavior.updateHz)}
            />
          </Field>
          <Field htmlFor="orbit-behavior-pit" label={t('studio.v3.behavior.visibleInPit')}>
            <Select
              id="orbit-behavior-pit"
              label={t('studio.v3.behavior.visibleInPit')}
              onChange={(next) => setPit(next as PitOption)}
              options={[
                { value: 'any', label: t('studio.v3.behavior.pit.any') },
                { value: 'in-pit', label: t('studio.v3.behavior.pit.inPit') },
                { value: 'on-track', label: t('studio.v3.behavior.pit.onTrack') },
              ]}
              value={pitValue}
            />
          </Field>
        </div>

        <Field label={t('studio.v3.behavior.visibleSessions')}>
          <SegMulti
            label={t('studio.v3.behavior.visibleSessions')}
            onToggle={(value, next) => toggleSession(value, next)}
            options={SESSION_TYPE_OPTIONS.map((sessionType) => ({
              value: sessionType,
              label: t(`studio.inspector.session.${sessionType}`),
            }))}
            values={selectedSessions}
            wide
          />
        </Field>

        <Note title={t('studio.inspector.note.lmuTitle')}>
          {t('studio.inspector.note.lmuBody')}
        </Note>
      </div>
    );
  }
}
