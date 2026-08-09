import { useI18n } from "../../../i18n/I18nProvider";
import type { CustomInspectorProps } from "../../core/inspector-control";
import type { WidgetColumnWidthPreset } from "../shared/widget-column";
import {
  moveStandingsColumn,
  parseStandingsContent,
  STANDINGS_COLUMN_TEMPLATES,
  STANDINGS_ROW_COUNT_OPTIONS,
  toggleStandingsColumn,
  updateStandingsColumn,
} from "./standings-content";

const WIDTH_PRESET_OPTIONS: readonly WidgetColumnWidthPreset[] = ["xs", "sm", "md", "lg", "auto"];
const ALIGN_OPTIONS = ["left", "center", "right"] as const;

function templateLabel(columnId: string): string {
  return STANDINGS_COLUMN_TEMPLATES.find((template) => template.id === columnId)?.label ?? columnId;
}

function updateRowCount(
  content: ReturnType<typeof parseStandingsContent>,
  rowCount: number,
): ReturnType<typeof parseStandingsContent> {
  return { ...content, rowCount };
}

export function StandingsContentInspector(props: CustomInspectorProps): React.ReactElement {
  const { widget, disabled, onContentChange } = props;
  const { t } = useI18n();
  const content = parseStandingsContent(widget.content);

  const publish = (nextContent: ReturnType<typeof parseStandingsContent>) => {
    onContentChange?.(nextContent as Record<string, unknown>);
  };

  return (
    <div data-testid="studio-inspector-section-content" data-widget-id={widget.id}>
      <div className="osv3-inspector-field-group" data-testid="studio-standings-row-count">
        <span className="osv3-inspector-field__label">{t("studio.v3.standings.rowCount")}</span>
        <div className="osv3-inspector-preset-row">
          {STANDINGS_ROW_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              data-testid={`studio-standings-row-count-${count}`}
              className={content.rowCount === count ? "is-active" : undefined}
              onClick={() => publish(updateRowCount(content, count))}
              disabled={disabled}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <ul className="osv3-standings-columns" data-testid="studio-standings-columns">
        {content.columns.map((column, index) => (
          <li key={column.id} className="osv3-standings-columns__item" data-testid={`studio-standings-column-${column.id}`}>
            <label className="osv3-standings-columns__toggle">
              <input
                type="checkbox"
                checked={column.enabled}
                disabled={disabled}
                onChange={() => publish(toggleStandingsColumn(content, column.id))}
              />
              <span>{templateLabel(column.id)}</span>
            </label>
            <div className="osv3-standings-columns__controls">
              <button
                type="button"
                disabled={disabled || index === 0}
                data-testid={`studio-standings-column-up-${column.id}`}
                onClick={() => publish(moveStandingsColumn(content, column.id, "up"))}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === content.columns.length - 1}
                data-testid={`studio-standings-column-down-${column.id}`}
                onClick={() => publish(moveStandingsColumn(content, column.id, "down"))}
              >
                ↓
              </button>
              <select
                value={column.widthPreset}
                disabled={disabled}
                data-testid={`studio-standings-column-width-${column.id}`}
                onChange={(event) =>
                  publish(
                    updateStandingsColumn(content, column.id, {
                      widthPreset: event.target.value as WidgetColumnWidthPreset,
                    }),
                  )
                }
              >
                {WIDTH_PRESET_OPTIONS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              {column.style?.align !== undefined || STANDINGS_COLUMN_TEMPLATES.find((t) => t.id === column.id)?.style?.align ? (
                <select
                  value={column.style?.align ?? "left"}
                  disabled={disabled}
                  data-testid={`studio-standings-column-align-${column.id}`}
                  onChange={(event) =>
                    publish(
                      updateStandingsColumn(content, column.id, {
                        style: { align: event.target.value as (typeof ALIGN_OPTIONS)[number] },
                      }),
                    )
                  }
                >
                  {ALIGN_OPTIONS.map((align) => (
                    <option key={align} value={align}>
                      {align}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}