import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { CrystalBrand, CrystalFooter, CrystalPill } from "../crystal-primitives";
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
  const canonicalColumns = model.columns.filter((column) =>
    ["position", "class", "carNumber", "driverName", "gap", "bestLap"].includes(column.metricId),
  );

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="relative"
      data-status={model.status}
      data-row-height={model.rowHeightMode}
      className="vc-relative"
      style={{
        ...buildRelativeAppearanceStyle(settings),
        width: "100%",
      }}
    >
      <div className="vc-relative-frame">
        {showHeader ? (
          <header className="vc-relative-header">
            <CrystalBrand>VANTARE</CrystalBrand>
            <CrystalPill><span aria-hidden="true">●</span> RELATIVE</CrystalPill>
          </header>
        ) : null}
        {model.statusMessage ? (
          <p className="vc-relative-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-relative-table-header" role="row">
          {canonicalColumns.map((column) => (
            <span key={column.id} data-metric={column.metricId}>
              {column.metricId === "position"
                ? "POS"
                : column.metricId === "class"
                  ? ""
                  : column.metricId === "carNumber"
                    ? "#"
                    : column.metricId === "driverName"
                      ? "PILOTO"
                      : column.metricId === "gap"
                        ? "GAP"
                        : "BEST"}
            </span>
          ))}
        </div>
        <div className="vc-relative-rows">
          {model.rows.map((row) => (
            <div
              key={row.id}
              data-relative-row={row.id}
              data-player={row.isPlayer ? "true" : undefined}
              data-tone={row.tone}
              data-class={row.vehicleClass || undefined}
              className={row.isPlayer ? "vc-relative-row vc-relative-player" : "vc-relative-row"}
            >
              {canonicalColumns.map((column) => {
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
                    style={{ textAlign: column.style?.align ?? "center", ...cell.style } as CSSProperties}
                  >
                    {cell.content}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <CrystalFooter>
          <span><strong>●</strong> LIVE TIMING</span>
          <span>SOF: —</span>
        </CrystalFooter>
      </div>
    </section>
  );
}
