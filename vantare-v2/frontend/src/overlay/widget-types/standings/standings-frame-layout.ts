import type { WidgetInstanceV3, WidgetLayoutV3 } from "../../core/profile-document";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { parseStandingsContent } from "./standings-content";
import { resolveFunctionalStandingsSize } from "./functional-standings-layout";
import { countFunctionalStandingsClassBands } from "./functional-standings-multiclass";
import { buildStandingsViewModelV2 } from "./standings-view-model-v2";
import { resolveMinimumWidthFrameLayout, resolveStandingsRedlineMinimumWidth } from "./standings-redline-layout";

export type StandingsFrameRuntime = Readonly<{
  frame: OverlayFrameV2;
  source: OverlaySourceStatusV2;
}>;

function resolveFunctionalClassBandCount(
  content: ReturnType<typeof parseStandingsContent>,
  runtime?: StandingsFrameRuntime,
): number {
  if (content.classificationMode !== "multiclass") return 0;
  if (!runtime) return 1;
  const model = buildStandingsViewModelV2(runtime.frame, runtime.source, content);
  return countFunctionalStandingsClassBands(model.rows, model.classificationMode);
}

export function resolveStandingsMinimumSize(
  widget: WidgetInstanceV3,
  brandVisible?: boolean,
  rowHeight = 30,
  runtime?: StandingsFrameRuntime,
): { width: number; height?: number } | undefined {
  if (widget.type === "standings" && widget.visual.systemId === "vantare-functional") {
    try {
      const content = parseStandingsContent(widget.content);
      return resolveFunctionalStandingsSize(content.columns, content.rowCount ?? 20, {
        ...widget.visual.baseSettings, ...widget.visual.appearanceOverrides,
        ...(brandVisible === undefined ? {} : { brandVisible }),
      }, rowHeight, resolveFunctionalClassBandCount(content, runtime));
    } catch {
      // Invalid content is reported by WidgetVisualHost, without hiding its diagnostic.
      return undefined;
    }
  }
  const width = resolveStandingsRedlineMinimumWidth(widget);
  return width === undefined ? undefined : { width };
}

export function resolveMinimumHeightFrameLayout(
  layout: WidgetLayoutV3, minimumHeight: number | undefined, viewportHeight?: number,
): WidgetLayoutV3 {
  if (minimumHeight === undefined) return layout;
  const h = Math.max(layout.h, minimumHeight);
  const y = viewportHeight === undefined ? layout.y
    : Math.min(Math.max(0, layout.y), Math.max(0, viewportHeight - h));
  return h === layout.h && y === layout.y ? layout : { ...layout, h, y };
}

export function resolveStandingsFrameLayout(
  widget: WidgetInstanceV3,
  layout: WidgetLayoutV3,
  viewportWidth?: number,
  viewportHeight?: number,
  brandVisible?: boolean,
  runtime?: StandingsFrameRuntime,
): WidgetLayoutV3 {
  const minimum = resolveStandingsMinimumSize(widget, brandVisible, 30, runtime);
  const sized = resolveMinimumWidthFrameLayout(layout, minimum?.width, viewportWidth);
  return resolveMinimumHeightFrameLayout(sized, minimum?.height, viewportHeight);
}

export function resolveStandingsMoveLayout(
  widget: WidgetInstanceV3, start: WidgetLayoutV3, preview: WidgetLayoutV3, viewportWidth?: number, viewportHeight?: number,
): WidgetLayoutV3 {
  const effectiveStart = resolveStandingsFrameLayout(widget, start, viewportWidth, viewportHeight);
  return resolveStandingsFrameLayout(widget, {
    ...effectiveStart, x: effectiveStart.x + preview.x - start.x, y: effectiveStart.y + preview.y - start.y,
  }, viewportWidth, viewportHeight);
}
