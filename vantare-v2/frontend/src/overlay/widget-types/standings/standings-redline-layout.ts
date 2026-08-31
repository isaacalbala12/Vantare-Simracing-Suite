import type { WidgetInstanceV3, WidgetLayoutV3 } from "../../core/profile-document";
import { resolveColumnWidthPixels, type WidgetColumnV3 } from "../shared/widget-column";
import {
  nearestWidthPreset,
  parseStandingsContent,
  STANDINGS_COLUMN_TEMPLATES,
  type StandingsContent,
} from "./standings-content";

const REDLINE_FIXED_METRICS = new Set(["position", "driverName"]);
const REDLINE_BASE_MIN_WIDTH_PX = 420;
const REDLINE_DELTA_TRACK_PX = 44;
const REDLINE_ROW_GAP_PX = 8;
const REDLINE_CHROME_PX = 16 + 18;

function fallbackWidth(metricId: string): number {
  return STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60;
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

function redlineColumns(columns: readonly WidgetColumnV3[]) {
  return {
    position: columns.find((column) => column.metricId === "position"),
    driver: columns.find((column) => column.metricId === "driverName"),
    flexible: columns.filter(
      (column) => column.enabled && !REDLINE_FIXED_METRICS.has(column.metricId),
    ),
  };
}

export function isStandingsRedlineWidget(widget: WidgetInstanceV3): boolean {
  if (widget.type !== "standings" || widget.visual.systemId !== "vantare-endurance") return false;
  const templateId = widget.visual.appearanceOverrides.templateId ?? widget.visual.baseSettings.templateId;
  return templateId === undefined || templateId === "standings-redline";
}

export function resolveStandingsRedlineRequiredWidth(content: StandingsContent): number {
  const { position, driver, flexible } = redlineColumns(content.columns);
  return Math.max(
    REDLINE_BASE_MIN_WIDTH_PX,
    redlineColumnWidth(position, "position")
      + redlineColumnWidth(driver, "driverName")
      + REDLINE_DELTA_TRACK_PX
      + flexible.reduce(
        (sum, column) => sum + redlineColumnWidth(column, column.metricId),
        0,
      )
      + REDLINE_ROW_GAP_PX * (2 + flexible.length)
      + REDLINE_CHROME_PX,
  );
}

export function resolveStandingsRedlineGridTemplate(columns: readonly WidgetColumnV3[]): string {
  const { position, driver, flexible } = redlineColumns(columns);
  return [
    `${redlineColumnWidth(position, "position")}px`,
    `minmax(${redlineColumnWidth(driver, "driverName")}px, 1fr)`,
    `${REDLINE_DELTA_TRACK_PX}px`,
    ...flexible.map((column) => `${redlineColumnWidth(column, column.metricId)}px`),
  ].join(" ");
}

export function resolveStandingsRedlineFrameLayout(
  widget: WidgetInstanceV3,
  layout: WidgetLayoutV3,
): WidgetLayoutV3 {
  if (!isStandingsRedlineWidget(widget)) return layout;
  try {
    const requiredWidth = resolveStandingsRedlineRequiredWidth(parseStandingsContent(widget.content));
    return requiredWidth > layout.w ? { ...layout, w: requiredWidth } : layout;
  } catch {
    // Invalid content remains owned by WidgetVisualHost's existing diagnostic boundary.
    return layout;
  }
}
