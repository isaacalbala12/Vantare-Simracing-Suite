import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../../widget-types/relative/relative-content";
import {
  buildRelativeAppearanceStyle,
  resolveRelativeClassColor,
  resolveRelativeGapColor,
} from "../../../widget-types/relative/relative-renderer-helpers";
import {
  resolveRelativeCellValue,
  type RelativeRowViewModel,
  type RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";

function columnFallbackWidth(metricId: string): number {
  return (
    RELATIVE_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60
  );
}

function renderCell(
  row: RelativeRowViewModel,
  metricId: string,
  settings: Readonly<Record<string, unknown>>,
): { content: string; style?: CSSProperties } {
  if (metricId === "class") {
    return {
      content: "",
      style: { background: resolveRelativeClassColor(row.vehicleClass, settings) },
    };
  }
  if (metricId === "gap") {
    const gapColor = resolveRelativeGapColor(row.tone, settings);
    return {
      content: row.isPlayer ? "—" : resolveRelativeCellValue(row, metricId),
      style: gapColor ? { color: gapColor } : undefined,
    };
  }
  return { content: resolveRelativeCellValue(row, metricId) };
}

export function RelativeOriginal({ model, settings }: WidgetRendererProps<RelativeViewModel>) {
  const showHeader = settings.showHeader !== false;

  return (
    <section
      data-widget-system="vantare-original"
      data-widget-renderer="relative"
      data-status={model.status}
      data-row-height={model.rowHeightMode}
      className="vo-relative"
      style={{
        ...buildRelativeAppearanceStyle(settings),
        width: "100%",
      }}
    >
      {showHeader ? (
        <header className="vo-relative-header">
          <span className="vo-relative-brand">VANTARE</span>
          <span className="vo-relative-title">RELATIVE</span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="vo-relative-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="vo-relative-rows">
        {model.rows.map((row, index) => (
          <div
            key={row.id}
            data-relative-row={row.id}
            data-player={row.isPlayer ? "true" : undefined}
            data-tone={row.tone}
            data-class={row.vehicleClass || undefined}
            className={index % 2 === 1 ? "vo-relative-row vo-relative-row-even" : "vo-relative-row"}
          >
            {model.columns.map((column) => {
              const width = resolveColumnWidthPixels(column, columnFallbackWidth(column.metricId));
              const cell = renderCell(row, column.metricId, settings);
              return (
                <span
                  key={column.id}
                  data-metric={column.metricId}
                  className={
                    column.metricId === "class" ? "vo-relative-class-bar" : "vo-relative-cell"
                  }
                  style={
                    {
                      width: `${width}px`,
                      textAlign: column.style?.align ?? "center",
                      ...cell.style,
                    } as CSSProperties
                  }
                >
                  {cell.content}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
