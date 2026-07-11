import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import {
  getEnabledRelativeColumns,
  parseRelativeContent,
} from "../../../overlay/widget-types/relative/relative-content";
import {
  computeRelativeConfiguredRowCount,
  computeRelativeIntrinsicHeight,
  computeRelativeIntrinsicWidth,
} from "../../../overlay/widget-types/relative/relative-renderer-helpers";
import { resolveColumnWidthPixels } from "../../../overlay/widget-types/shared/widget-column";
import {
  getEnabledStandingsColumns,
  parseStandingsContent,
  STANDINGS_COLUMN_TEMPLATES,
} from "../../../overlay/widget-types/standings/standings-content";

export type WidgetContentBaseSize = {
  width: number;
  height: number;
};

const STANDINGS_HEADER_HEIGHT = 80;
const STANDINGS_CLASS_HEIGHT = 24;
const STANDINGS_CONTAINER_TOP_MARGIN = 4;
const STANDINGS_ROW_HEIGHT = 24;
const STANDINGS_FOOTER_TOP_MARGIN = 4;
const STANDINGS_FOOTER_HEIGHT = 21;
const STANDINGS_PANEL_BORDER = 2;
const STANDINGS_DEFAULT_MAX_ROWS = 12;
const STANDINGS_HORIZONTAL_PADDING = 32;

function standingsColumnFallbackWidth(metricId: string): number {
  return (
    STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60
  );
}

function computeStandingsIntrinsicWidth(columns: ReturnType<typeof getEnabledStandingsColumns>): number {
  const columnWidth = columns.reduce(
    (total, column) =>
      total + resolveColumnWidthPixels(column, standingsColumnFallbackWidth(column.metricId)),
    0,
  );
  return columnWidth + STANDINGS_HORIZONTAL_PADDING;
}

function computeStandingsIntrinsicHeight(maxRows: number): number {
  const safeRows = Math.max(1, Math.round(maxRows));
  return (
    STANDINGS_HEADER_HEIGHT
    + STANDINGS_CLASS_HEIGHT
    + STANDINGS_CONTAINER_TOP_MARGIN
    + safeRows * STANDINGS_ROW_HEIGHT
    + STANDINGS_FOOTER_TOP_MARGIN
    + STANDINGS_FOOTER_HEIGHT
    + STANDINGS_PANEL_BORDER
  );
}

export function resolveWidgetContentBaseSize(widget: WidgetInstanceV3): WidgetContentBaseSize | null {
  if (widget.type === "relative") {
    const content = parseRelativeContent(widget.content);
    const columns = getEnabledRelativeColumns(content);
    if (columns.length === 0) {
      return null;
    }
    const rowCount = computeRelativeConfiguredRowCount(content);
    return {
      width: computeRelativeIntrinsicWidth(columns),
      height: computeRelativeIntrinsicHeight(content.rowHeightMode, rowCount),
    };
  }

  if (widget.type === "standings") {
    const content = parseStandingsContent(widget.content);
    const columns = getEnabledStandingsColumns(content);
    if (columns.length === 0) {
      return null;
    }
    return {
      width: computeStandingsIntrinsicWidth(columns),
      height: computeStandingsIntrinsicHeight(STANDINGS_DEFAULT_MAX_ROWS),
    };
  }

  return null;
}

export function normalizeStudioWidgetLayout(
  layout: Pick<WidgetInstanceV3["layout"], "x" | "y" | "w" | "h" | "zIndex" | "aspectLocked">,
  baseSize: WidgetContentBaseSize,
  widget: WidgetInstanceV3,
): WidgetInstanceV3["layout"] {
  const { minimumSize } = widgetTypeRegistry.get(widget.type).capabilities;
  const safeW = Math.max(minimumSize.width, layout.w > 0 ? layout.w : baseSize.width);
  const rawH = Math.max(minimumSize.height, (safeW * baseSize.height) / baseSize.width);
  return {
    ...layout,
    w: safeW,
    h: Math.round(rawH),
  };
}

export function resolveStudioWidgetDisplayLayout(
  layout: WidgetInstanceV3["layout"],
  widget: WidgetInstanceV3,
): WidgetInstanceV3["layout"] {
  const baseSize = resolveWidgetContentBaseSize(widget);
  if (!baseSize || baseSize.width <= 0 || baseSize.height <= 0) {
    return layout;
  }
  return normalizeStudioWidgetLayout(layout, baseSize, widget);
}