import { useI18n } from '../../../i18n/I18nProvider';
import type { CustomInspectorProps } from '../../core/inspector-control';
import { Check, Field, Seg } from '../../../ui/orbit';
import {
  resolveColumnWidthPixels,
  type WidgetColumnV3,
  type WidgetColumnWidthPreset,
} from '../shared/widget-column';
import {
  moveStandingsColumn,
  nearestWidthPreset,
  parseStandingsContent,
  STANDINGS_COLUMN_TEMPLATES,
  STANDINGS_ROW_COUNT_OPTIONS,
  toggleStandingsColumn,
  updateStandingsColumn,
} from './standings-content';

/** En la piel Orbit el ancho se ofrece como `Seg`: tres pasos, no cinco. */
const ORBIT_WIDTH_OPTIONS: readonly WidgetColumnWidthPreset[] = ['sm', 'md', 'lg'];
const REDLINE_FIXED_METRICS = new Set(['position', 'driverName']);
const REDLINE_MIN_WIDTH_PX = 420;
const REDLINE_DELTA_TRACK_PX = 44;
const REDLINE_ROW_GAP_PX = 8;
const REDLINE_CHROME_PX = 16 + 18;

type AlignOption = 'left' | 'center' | 'right';

function templateLabel(columnId: string): string {
  return STANDINGS_COLUMN_TEMPLATES.find((template) => template.id === columnId)?.label ?? columnId;
}

function isRedlineWidget(widget: CustomInspectorProps['widget']): boolean {
  if (widget.visual.systemId !== 'vantare-endurance') return false;
  const templateId =
    widget.visual.appearanceOverrides.templateId ?? widget.visual.baseSettings.templateId;
  return templateId === undefined || templateId === 'standings-redline';
}

function fallbackWidth(metricId: string): number {
  return (
    STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)
      ?.defaultWidth ?? 60
  );
}

function redlineColumnWidth(column: WidgetColumnV3 | undefined, metricId: string): number {
  const fallback = fallbackWidth(metricId);
  return resolveColumnWidthPixels(
    column ?? {
      id: metricId,
      metricId,
      enabled: true,
      widthPreset: nearestWidthPreset(fallback),
    },
    fallback,
  );
}

function redlineRequiredWidth(content: ReturnType<typeof parseStandingsContent>): number {
  const position = content.columns.find((column) => column.metricId === 'position');
  const driver = content.columns.find((column) => column.metricId === 'driverName');
  const flexible = content.columns.filter(
    (column) => column.enabled && !REDLINE_FIXED_METRICS.has(column.metricId),
  );
  return Math.max(
    REDLINE_MIN_WIDTH_PX,
    redlineColumnWidth(position, 'position') +
      redlineColumnWidth(driver, 'driverName') +
      REDLINE_DELTA_TRACK_PX +
      flexible.reduce(
        (sum, column) => sum + redlineColumnWidth(column, column.metricId),
        0,
      ) +
      REDLINE_ROW_GAP_PX * (2 + flexible.length) +
      REDLINE_CHROME_PX,
  );
}

function moveRedlineColumn(
  content: ReturnType<typeof parseStandingsContent>,
  columnId: string,
  direction: 'up' | 'down',
): ReturnType<typeof parseStandingsContent> {
  const flexibleIndexes = content.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !REDLINE_FIXED_METRICS.has(column.metricId));
  const index = flexibleIndexes.findIndex(({ column }) => column.id === columnId);
  const target = flexibleIndexes[direction === 'up' ? index - 1 : index + 1];
  const source = flexibleIndexes[index];
  if (!source || !target) return content;
  const columns = [...content.columns];
  [columns[source.index], columns[target.index]] = [columns[target.index]!, columns[source.index]!];
  return { ...content, columns };
}

function updateRowCount(
  content: ReturnType<typeof parseStandingsContent>,
  rowCount: number,
): ReturnType<typeof parseStandingsContent> {
  return { ...content, rowCount };
}

/** `true` cuando la columna admite alineacion (propia o heredada de plantilla). */
function hasAlign(column: { id: string; style?: { align?: string } }): boolean {
  if (column.style?.align !== undefined) return true;
  return (
    STANDINGS_COLUMN_TEMPLATES.find((template) => template.id === column.id)?.style?.align !==
    undefined
  );
}

/**
 * Boton de reordenar: el `IconButton` del kit solo acepta nombres del sprite
 * Orbit y ahi no hay flechas, asi que se reusan sus clases (`orbit-icon-btn`)
 * con un trazo propio. Sigue siendo el control del kit, sin `title` nativo.
 */
function OrderButton(props: {
  direction: 'up' | 'down';
  label: string;
  disabled?: boolean;
  testId: string;
  onClick(): void;
}) {
  const { direction, label, disabled, testId, onClick } = props;
  return (
    <button
      aria-label={label}
      className="orbit-icon-btn orbit-icon-btn--28"
      data-testid={testId}
      data-tip={label}
      data-tip-side="top"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        focusable="false"
        height={13}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
        viewBox="0 0 14 14"
        width={13}
      >
        {direction === 'up' ? (
          <path d="M7 11V3M3.5 6.5 7 3l3.5 3.5" />
        ) : (
          <path d="M7 3v8M3.5 7.5 7 11l3.5-3.5" />
        )}
      </svg>
    </button>
  );
}

export function StandingsContentInspector(props: CustomInspectorProps): React.ReactElement {
  const { widget, disabled, onContentChange } = props;
  const { t } = useI18n();
  const content = parseStandingsContent(widget.content);
  const redline = isRedlineWidget(widget);
  const requiredWidth = redline ? redlineRequiredWidth(content) : 0;
  const flexibleColumns = redline
    ? content.columns.filter((column) => !REDLINE_FIXED_METRICS.has(column.metricId))
    : content.columns;

  const publish = (nextContent: ReturnType<typeof parseStandingsContent>) => {
    onContentChange?.(nextContent as Record<string, unknown>);
  };

  {
    // Misma logica y mismos handlers que la piel V3: solo cambia el JSX. Ni un
    // control nativo — ni `input[type=checkbox]` ni `select` (`briefing 04 · A5`).
    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-content"
        data-widget-id={widget.id}
      >
        <div data-testid="studio-standings-row-count">
          <Field label={t('studio.inspector.content.rows')}>
            <Seg
              label={t('studio.inspector.content.rows')}
              onChange={(next) => publish(updateRowCount(content, Number(next)))}
              options={STANDINGS_ROW_COUNT_OPTIONS.map((count) => ({
                value: String(count),
                label: String(count),
                disabled,
              }))}
              value={String(content.rowCount)}
              wide
            />
          </Field>
        </div>

        {redline ? (
          <p className="orbit-studio-cols__note" data-testid="studio-standings-redline-fixed-note">
            {t('studio.inspector.content.redlineFixed')}
          </p>
        ) : null}
        {redline && widget.layout.w < requiredWidth ? (
          <p
            className="orbit-studio-cols__warning"
            data-testid="studio-standings-redline-width-warning"
            role="alert"
          >
            {t('studio.inspector.content.redlineWidthWarning').replace(
              '{width}',
              String(requiredWidth),
            )}
          </p>
        ) : null}

        <ul className="orbit-studio-cols" data-testid="studio-standings-columns">
          {content.columns.map((column, index) => {
            const name = templateLabel(column.id);
            const align = (column.style?.align ?? 'left') as AlignOption;
            const fixed = redline && REDLINE_FIXED_METRICS.has(column.metricId);
            const flexibleIndex = flexibleColumns.findIndex((entry) => entry.id === column.id);
            const move = (direction: 'up' | 'down') =>
              publish(
                redline
                  ? moveRedlineColumn(content, column.id, direction)
                  : moveStandingsColumn(content, column.id, direction),
              );
            return (
              <li
                className="orbit-studio-cols__item"
                data-testid={`studio-standings-column-${column.id}`}
                key={column.id}
              >
                <div className="orbit-studio-cols__head">
                  <Check
                    checked={fixed || column.enabled}
                    data-testid={`studio-standings-column-toggle-${column.id}`}
                    disabled={disabled || fixed}
                    label={name}
                    onChange={() => publish(toggleStandingsColumn(content, column.id))}
                  >
                    {name}
                  </Check>
                  <div className="orbit-studio-cols__order">
                    <OrderButton
                      direction="up"
                      disabled={disabled || fixed || (redline ? flexibleIndex === 0 : index === 0)}
                      label={`${t('studio.inspector.content.moveUp')} · ${name}`}
                      onClick={() => move('up')}
                      testId={`studio-standings-column-up-${column.id}`}
                    />
                    <OrderButton
                      direction="down"
                      disabled={
                        disabled ||
                        fixed ||
                        (redline
                          ? flexibleIndex === flexibleColumns.length - 1
                          : index === content.columns.length - 1)
                      }
                      label={`${t('studio.inspector.content.moveDown')} · ${name}`}
                      onClick={() => move('down')}
                      testId={`studio-standings-column-down-${column.id}`}
                    />
                  </div>
                </div>
                <div className="orbit-studio-cols__controls">
                  <div
                    className="orbit-studio-cols__seg"
                    data-testid={`studio-standings-column-width-${column.id}`}
                  >
                    <Seg
                      label={`${t('studio.inspector.content.width')} · ${name}`}
                      onChange={(next) =>
                        publish(
                          updateStandingsColumn(content, column.id, {
                            widthPreset: next as WidgetColumnWidthPreset,
                          }),
                        )
                      }
                      options={ORBIT_WIDTH_OPTIONS.map((preset) => ({
                        value: preset,
                        label: t(`studio.inspector.content.width.${preset}`),
                        disabled,
                      }))}
                      value={
                        ORBIT_WIDTH_OPTIONS.includes(column.widthPreset)
                          ? column.widthPreset
                          : ('md' as WidgetColumnWidthPreset)
                      }
                      wide
                    />
                  </div>
                  {hasAlign(column) ? (
                    <div
                      className="orbit-studio-cols__seg"
                      data-testid={`studio-standings-column-align-${column.id}`}
                    >
                      <Seg
                        label={`${t('studio.inspector.content.align')} · ${name}`}
                        onChange={(next) =>
                          publish(
                            updateStandingsColumn(content, column.id, {
                              style: { align: next as AlignOption },
                            }),
                          )
                        }
                        options={[
                          {
                            value: 'left',
                            label: t('studio.inspector.content.align.left'),
                            disabled,
                          },
                          {
                            value: 'right',
                            label: t('studio.inspector.content.align.right'),
                            disabled,
                          },
                        ]}
                        value={align === 'center' ? 'left' : align}
                        wide
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}
