import type { CoreWidgetType, WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";

export type WidgetIntrinsicScale = {
  baseSize: { width: number; height: number };
  scale: number;
};

export function resolveWidgetIntrinsicScale(
  layout: Pick<WidgetLayoutV3, "w" | "h">,
  widgetType: CoreWidgetType,
): WidgetIntrinsicScale {
  const { defaultSize } = widgetTypeRegistry.get(widgetType).capabilities;
  const baseSize = { width: defaultSize.width, height: defaultSize.height };
  const safeW = layout.w > 0 ? layout.w : baseSize.width;
  const safeH = layout.h > 0 ? layout.h : baseSize.height;
  return {
    baseSize,
    scale: Math.min(safeW / baseSize.width, safeH / baseSize.height),
  };
}