import type { WidgetLayoutV3, WidgetType } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";

type VisualLayoutSize = Pick<WidgetLayoutV3, "w" | "h">;

export type WidgetVisualGeometry = {
  baseWidth: number;
  baseHeight: number;
  scale: number;
};

export function resolveWidgetVisualGeometry(
  layout: VisualLayoutSize,
  baseWidth: number,
): WidgetVisualGeometry {
  const safeBaseWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 1;
  const safeWidth = Number.isFinite(layout.w) && layout.w > 0 ? layout.w : safeBaseWidth;
  const safeHeight = Number.isFinite(layout.h) && layout.h > 0 ? layout.h : 1;
  const scale = safeWidth / safeBaseWidth;
  return {
    baseWidth: safeBaseWidth,
    baseHeight: safeHeight / scale,
    scale,
  };
}

export function resolveWidgetVisualGeometryForType(
  layout: VisualLayoutSize,
  widgetType: WidgetType,
): WidgetVisualGeometry {
  const { width } = widgetTypeRegistry.get(widgetType).capabilities.defaultSize;
  return resolveWidgetVisualGeometry(layout, width);
}
