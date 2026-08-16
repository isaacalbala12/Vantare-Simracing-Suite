import type { CustomInspectorProps } from "../../core/inspector-control";
import type { WidgetColumnWidthPreset } from "../shared/widget-column";
import {
  moveRelativeColumn,
  parseRelativeContent,
  RELATIVE_COLUMN_TEMPLATES,
  toggleRelativeColumn,
  updateRelativeColumn,
  updateRelativeFilters,
} from "./relative-content";

const WIDTH_PRESET_OPTIONS: readonly WidgetColumnWidthPreset[] = ["xs", "sm", "md", "lg", "auto"];
const ALIGN_OPTIONS = ["left", "center", "right"] as const;

function templateLabel(columnId: string): string {
  return RELATIVE_COLUMN_TEMPLATES.find((template) => template.id === columnId)?.label ?? columnId;
}

export function RelativeContentInspector(props: CustomInspectorProps): React.ReactElement {
  const { widget, disabled, onContentChange } = props;
  const content = parseRelativeContent(widget.content);

  const publish = (nextContent: ReturnType<typeof parseRelativeContent>) => {
    onContentChange?.(nextContent as Record<string, unknown>);
  };

  return (
    <div data-testid="studio-inspector-section-content" data-widget-id={widget.id}>
      <fieldset className="osv3-relative-filters" data-testid="studio-relative-filters">
        <legend>Filtros</legend>
        <label>
          Clase
          <select
            value={content.classScope}
            disabled={disabled}
            data-testid="studio-relative-class-scope"
            onChange={(event) =>
              publish(
                updateRelativeFilters(content, {
                  classScope: event.target.value as "all" | "sameClass",
                }),
              )
            }
          >
            <option value="all">Todas</option>
            <option value="sameClass">Misma clase</option>
          </select>
        </label>
        <label>
          Altura fila
          <select
            value={content.rowHeightMode}
            disabled={disabled}
            data-testid="studio-relative-row-height-mode"
            onChange={(event) =>
              publish(
                updateRelativeFilters(content, {
                  rowHeightMode: event.target.value as "compact" | "fill",
                }),
              )
            }
          >
            <option value="compact">Compacto</option>
            <option value="fill">Rellenar</option>
          </select>
        </label>
      </fieldset>
      <ul className="osv3-relative-columns" data-testid="studio-relative-columns">
        {content.columns.map((column, index) => (
          <li key={column.id} className="osv3-relative-columns__item" data-testid={`studio-relative-column-${column.id}`}>
            <label className="osv3-relative-columns__toggle">
              <input
                type="checkbox"
                checked={column.enabled}
                disabled={disabled}
                onChange={() => publish(toggleRelativeColumn(content, column.id))}
              />
              <span>{templateLabel(column.id)}</span>
            </label>
            <div className="osv3-relative-columns__controls">
              <button
                type="button"
                disabled={disabled || index === 0}
                data-testid={`studio-relative-column-up-${column.id}`}
                onClick={() => publish(moveRelativeColumn(content, column.id, "up"))}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === content.columns.length - 1}
                data-testid={`studio-relative-column-down-${column.id}`}
                onClick={() => publish(moveRelativeColumn(content, column.id, "down"))}
              >
                ↓
              </button>
              <select
                value={column.widthPreset}
                disabled={disabled}
                data-testid={`studio-relative-column-width-${column.id}`}
                onChange={(event) =>
                  publish(
                    updateRelativeColumn(content, column.id, {
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
              {column.style?.align !== undefined ||
              RELATIVE_COLUMN_TEMPLATES.find((template) => template.id === column.id)?.style?.align ? (
                <select
                  value={column.style?.align ?? "left"}
                  disabled={disabled}
                  data-testid={`studio-relative-column-align-${column.id}`}
                  onChange={(event) =>
                    publish(
                      updateRelativeColumn(content, column.id, {
                        style: { align: event.target.value as "left" | "center" | "right" },
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
