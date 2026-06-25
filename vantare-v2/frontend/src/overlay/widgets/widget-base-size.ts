import type { ProfileConfig, WidgetConfig, Rect } from "../../lib/profile";
import { enrichWidgetPropsWithVariant } from "../../lib/widget-variants";
import { getRelativeIntrinsicWidth, getRelativeCompactHeight } from "./relative-format";
import { getStandingsIntrinsicWidth } from "./standings-format";
import { getRelativeFilters } from "./relative-filters";
import { createDefaultRelativeColumns } from "./relative-catalog";
import { createDefaultStandingsColumns, getStandingsColumn } from "./standings-catalog";
import type { ColumnConfig } from "../../lib/profile";
import { WIDGET_MIN_SIZE } from "../../lib/canvas-math";

export type WidgetBaseSize = { width: number; height: number };

// Alturas deterministas para standings (derivadas de los paddings Tailwind del widget).
// header: pt-4(16) + pb-2(8) + text-3xl lh(36) + mb-1(4) + text-[11px](~16) = 80
export const STANDINGS_HEADER_HEIGHT = 80;
// class: py-1 (8) + text-[11px] (~16) = 24
export const STANDINGS_CLASS_HEIGHT = 24;
// nuevo: mt-1 del container de filas
export const STANDINGS_CONTAINER_TOP_MARGIN = 4;
export const STANDINGS_ROW_HEIGHT = 24;
// nuevo: mt-1 del footer
export const STANDINGS_FOOTER_TOP_MARGIN = 4;
// footer: py-1(8) + text-[8px](12) + border-t(1) = 21
export const STANDINGS_FOOTER_HEIGHT = 21;
// nuevo: 1px top + 1px bottom del panel
export const STANDINGS_PANEL_BORDER = 2;
export const STANDINGS_DEFAULT_MAX_ROWS = 12;

// Relative fill: header (pt-2+pb-1+text-xl+mb-0.5 = ~40) + class (py-1+text-[10px] = ~24) + footer/padding (~8)
export const RELATIVE_FILL_HEADER_HEIGHT = 40;
export const RELATIVE_FILL_CLASS_HEIGHT = 24;
export const RELATIVE_FILL_FOOTER_PADDING = 8;
export const RELATIVE_FILL_ROW_MIN = 24;

function getActiveRelativeColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as { columns?: ColumnConfig[] } | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultRelativeColumns();
  return sourceColumns.filter((column) => column.enabled);
}

function getActiveStandingsColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as { columns?: ColumnConfig[] } | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultStandingsColumns();
  return sourceColumns.filter((column) => column.enabled && getStandingsColumn(column.id));
}

export function getWidgetBaseSize(
  type: string,
  widget: WidgetConfig,
  profile?: ProfileConfig | null,
): WidgetBaseSize | null {
  if (type !== "relative" && type !== "standings") {
    return null;
  }

  const props = profile ? enrichWidgetPropsWithVariant(profile, widget) : widget.props;

  if (type === "relative") {
    const columns = getActiveRelativeColumns(props);
    if (columns.length === 0) return null;
    const width = getRelativeIntrinsicWidth(columns);
    const filters = getRelativeFilters(
      (props?.variant as { filters?: Record<string, unknown> } | undefined)?.filters,
      props,
    );
    const rowCount = filters.rangeAhead + filters.rangeBehind + (filters.includePlayer ? 1 : 0);
    let height: number;
    if (filters.rowHeightMode === "compact") {
      height = getRelativeCompactHeight(rowCount);
    } else {
      height = RELATIVE_FILL_HEADER_HEIGHT + RELATIVE_FILL_CLASS_HEIGHT + RELATIVE_FILL_FOOTER_PADDING + rowCount * RELATIVE_FILL_ROW_MIN;
    }
    return { width, height };
  }

  // standings
  const columns = getActiveStandingsColumns(props);
  if (columns.length === 0) return null;
  const width = getStandingsIntrinsicWidth(columns);
  const maxRows = typeof props?.maxRows === "number" && Number.isFinite(props.maxRows)
    ? Math.max(1, Math.round(props.maxRows))
    : STANDINGS_DEFAULT_MAX_ROWS;
  const height =
    STANDINGS_HEADER_HEIGHT +
    STANDINGS_CLASS_HEIGHT +
    STANDINGS_CONTAINER_TOP_MARGIN +
    maxRows * STANDINGS_ROW_HEIGHT +
    STANDINGS_FOOTER_TOP_MARGIN +
    STANDINGS_FOOTER_HEIGHT +
    STANDINGS_PANEL_BORDER;
  return { width, height };
}

export function normalizeWidgetVisualRect(
  position: Rect,
  baseSize: WidgetBaseSize | null,
): Rect {
  if (!baseSize || baseSize.width <= 0 || baseSize.height <= 0) {
    return position;
  }
  const h = Math.max(WIDGET_MIN_SIZE.h, Math.round(position.w * baseSize.height / baseSize.width));
  return {
    x: position.x,
    y: position.y,
    w: position.w,
    h,
  };
}
