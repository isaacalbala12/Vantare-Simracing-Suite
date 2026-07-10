import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../../widget-types/shared/widget-column";
import { RELATIVE_COLUMN_TEMPLATES } from "../../../widget-types/relative/relative-content";
import {
  buildRelativeAppearanceStyle,
  computeRelativeIntrinsicWidth,
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

export function RelativeCrystal({ model, settings }: WidgetRendererProps<RelativeViewModel>) {
  const showHeader = settings.showHeader !== false;
  const intrinsicWidth = computeRelativeIntrinsicWidth(model.columns);
  const fillRows = model.rowHeightMode === "fill";

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="relative"
      data-status={model.status}
      data-row-height={model.rowHeightMode}
      className="vc-relative"
      style={{
        ...buildRelativeAppearanceStyle(settings),
        minWidth: `${intrinsicWidth}px`,
        width: fillRows ? "100%" : `${intrinsicWidth}px`,
      }}
    >
      <div className="vc-relative-glow" aria-hidden="true" />
      <div className="vc-relative-frame">
        {showHeader ? (
          <header className="vc-relative-header">
            <span className="vc-relative-brand">VANTARE</span>
            <span className="vc-relative-title">RELATIVE</span>
          </header>
        ) : null}
        {model.statusMessage ? (
          <p className="vc-relative-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-relative-rows">
          {model.rows.map((row) => (
            <article
              key={row.id}
              data-relative-row={row.id}
              data-player={row.isPlayer ? "true" : undefined}
              data-tone={row.tone}
              data-class={row.vehicleClass || undefined}
              className={row.isPlayer ? "vc-relative-row-card vc-relative-player" : "vc-relative-row-card"}
            >
              {model.columns.map((column) => {
                const width = resolveColumnWidthPixels(column, columnFallbackWidth(column.metricId));
                const cell = renderCell(row, column.metricId, settings);
                return (
                  <span
                    key={column.id}
                    data-metric={column.metricId}
                    className={
                      column.metricId === "class"
                        ? "vc-relative-class-bar"
                        : "vc-relative-cell"
                    }
                    style={
                      {
                        flexBasis: `${width}px`,
                        textAlign: column.style?.align ?? "center",
                        ...cell.style,
                      } as CSSProperties
                    }
                  >
                    {cell.content}
                  </span>
                );
              })}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}