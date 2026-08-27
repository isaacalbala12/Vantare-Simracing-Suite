import { useI18n } from '../../../i18n/I18nProvider';
import type { CustomInspectorProps } from '../../core/inspector-control';
import { Check, Field, Seg } from '../../../ui/orbit';
import type { WidgetColumnWidthPreset } from '../shared/widget-column';
import {
  moveStandingsColumn,
  parseStandingsContent,
  STANDINGS_COLUMN_TEMPLATES,
  STANDINGS_ROW_COUNT_OPTIONS,
  toggleStandingsColumn,
  updateStandingsColumn,
} from './standings-content';

/** En la piel Orbit el ancho se ofrece como `Seg`: tres pasos, no cinco. */
const ORBIT_WIDTH_OPTIONS: readonly WidgetColumnWidthPreset[] = ['sm', 'md', 'lg'];

type AlignOption = 'left' | 'center' | 'right';

function templateLabel(columnId: string): string {
  return STANDINGS_COLUMN_TEMPLATES.find((template) => template.id === columnId)?.label ?? columnId;
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

        <ul className="orbit-studio-cols" data-testid="studio-standings-columns">
          {content.columns.map((column, index) => {
            const name = templateLabel(column.id);
            const align = (column.style?.align ?? 'left') as AlignOption;
            return (
              <li
                className="orbit-studio-cols__item"
                data-testid={`studio-standings-column-${column.id}`}
                key={column.id}
              >
                <div className="orbit-studio-cols__head">
                  <Check
                    checked={column.enabled}
                    data-testid={`studio-standings-column-toggle-${column.id}`}
                    disabled={disabled}
                    label={name}
                    onChange={() => publish(toggleStandingsColumn(content, column.id))}
                  >
                    {name}
                  </Check>
                  <div className="orbit-studio-cols__order">
                    <OrderButton
                      direction="up"
                      disabled={disabled || index === 0}
                      label={`${t('studio.inspector.content.moveUp')} · ${name}`}
                      onClick={() => publish(moveStandingsColumn(content, column.id, 'up'))}
                      testId={`studio-standings-column-up-${column.id}`}
                    />
                    <OrderButton
                      direction="down"
                      disabled={disabled || index === content.columns.length - 1}
                      label={`${t('studio.inspector.content.moveDown')} · ${name}`}
                      onClick={() => publish(moveStandingsColumn(content, column.id, 'down'))}
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
