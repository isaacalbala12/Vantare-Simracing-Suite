import type { StandingsRowViewModel } from "../../../widget-types/standings/standings-view-model";
import { capGroupRows, groupRowsByClass } from "./standings-endurance-shared";

export type StandingsEnduranceLayoutTemplate =
  | "standings-f1"
  | "standings-wec"
  | "standings-lmu"
  | "standings-racelabs"
  | "standings-apex"
  | "standings-neo"
  | "standings-redline"
  | "standings-tower"
  | "standings-strip";

type LayoutMetrics = Readonly<{
  rowHeight: number;
  headerHeight: number;
  baseHeight: number;
  groupHeight: number;
  extraGroupHeight: number;
  maxRowsPerGroup?: number;
}>;

const LAYOUT_METRICS: Readonly<Record<StandingsEnduranceLayoutTemplate, LayoutMetrics>> = {
  "standings-f1": { rowHeight: 30, headerHeight: 54, baseHeight: 0, groupHeight: 24, extraGroupHeight: 0 },
  "standings-wec": { rowHeight: 34, headerHeight: 42, baseHeight: 20, groupHeight: 27, extraGroupHeight: 6, maxRowsPerGroup: 8 },
  "standings-lmu": { rowHeight: 36, headerHeight: 31, baseHeight: 0, groupHeight: 0, extraGroupHeight: 2 },
  "standings-racelabs": { rowHeight: 32, headerHeight: 32, baseHeight: 0, groupHeight: 0, extraGroupHeight: 2 },
  "standings-apex": { rowHeight: 27, headerHeight: 32, baseHeight: 0, groupHeight: 19, extraGroupHeight: 0 },
  "standings-neo": { rowHeight: 38, headerHeight: 38, baseHeight: 0, groupHeight: 37, extraGroupHeight: 12 },
  "standings-redline": { rowHeight: 30, headerHeight: 28, baseHeight: 16, groupHeight: 28, extraGroupHeight: 10 },
  "standings-tower": { rowHeight: 20, headerHeight: 24, baseHeight: 20, groupHeight: 16, extraGroupHeight: 4 },
  "standings-strip": { rowHeight: 20, headerHeight: 24, baseHeight: 20, groupHeight: 0, extraGroupHeight: 0 },
};

/**
 * Keeps only rows whose complete layout box fits in the widget viewport.
 * Metrics mirror the existing Endurance template geometry; this function does
 * not resize or restyle a row.
 */
export function fitStandingsRowsToHeight(
  rows: readonly StandingsRowViewModel[],
  options: Readonly<{
    templateId: StandingsEnduranceLayoutTemplate;
    viewportHeight: number;
    showSessionHeader: boolean;
    hasStatusMessage?: boolean;
  }>,
): StandingsRowViewModel[] {
  if (!Number.isFinite(options.viewportHeight)) {
    return [...rows];
  }
  const metrics = LAYOUT_METRICS[options.templateId];
  let remaining = Math.max(0, options.viewportHeight)
    - metrics.baseHeight
    - (options.showSessionHeader ? metrics.headerHeight : 0)
    - (options.hasStatusMessage ? 20 : 0);
  const result: StandingsRowViewModel[] = [];
  const groups = groupRowsByClass(rows);

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    const candidates = metrics.maxRowsPerGroup === undefined
      ? group.rows
      : capGroupRows(group.rows, metrics.maxRowsPerGroup).map(({ row }) => row);
    const groupCost = metrics.groupHeight + (groupIndex > 0 ? metrics.extraGroupHeight : 0);
    if (candidates.length === 0 || remaining < groupCost + metrics.rowHeight) {
      break;
    }
    remaining -= groupCost;
    for (const row of candidates) {
      if (remaining < metrics.rowHeight) {
        return result;
      }
      result.push(row);
      remaining -= metrics.rowHeight;
    }
  }

  return result;
}
