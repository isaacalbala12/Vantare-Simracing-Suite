import type { CoreWidgetType, WidgetInstanceV3, WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import {
  resolveStudioWidgetDisplayLayout,
  resolveWidgetContentBaseSize,
  type WidgetContentBaseSize,
} from "./widget-content-base-size";

export type WidgetIntrinsicScale = {
  baseSize: { width: number; height: number };
  scale: number;
};

function resolveRegistryDefaultBaseSize(widgetType: CoreWidgetType): WidgetContentBaseSize {
  const { defaultSize } = widgetTypeRegistry.get(widgetType).capabilities;
  return { width: defaultSize.width, height: defaultSize.height };
}

function resolveIntrinsicBaseSize(widget: WidgetInstanceV3): WidgetContentBaseSize {
  return resolveWidgetContentBaseSize(widget) ?? resolveRegistryDefaultBaseSize(widget.type);
}

export function resolveWidgetIntrinsicScale(
  layout: Pick<WidgetLayoutV3, "w" | "h">,
  widget: WidgetInstanceV3,
): WidgetIntrinsicScale;
export function resolveWidgetIntrinsicScale(
  layout: Pick<WidgetLayoutV3, "w" | "h">,
  widgetType: CoreWidgetType,
): WidgetIntrinsicScale;
export function resolveWidgetIntrinsicScale(
  layout: Pick<WidgetLayoutV3, "w" | "h">,
  widgetOrType: WidgetInstanceV3 | CoreWidgetType,
): WidgetIntrinsicScale {
  const baseSize =
    typeof widgetOrType === "string"
      ? resolveRegistryDefaultBaseSize(widgetOrType)
      : resolveIntrinsicBaseSize(widgetOrType);
  const safeW = layout.w > 0 ? layout.w : baseSize.width;
  const safeH = layout.h > 0 ? layout.h : baseSize.height;
  return {
    baseSize,
    scale: Math.min(safeW / baseSize.width, safeH / baseSize.height),
  };
}

export function resolveStudioWidgetFrameGeometry(
  widget: WidgetInstanceV3,
  previewKind: "move" | "resize" | undefined,
  rawGeometry: WidgetLayoutV3,
): WidgetLayoutV3 {
  if (previewKind === "resize") {
    return rawGeometry;
  }
  return resolveStudioWidgetDisplayLayout(rawGeometry, widget);
}