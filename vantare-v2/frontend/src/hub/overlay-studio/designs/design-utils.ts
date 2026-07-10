import { designSystemRegistry } from "../../../overlay/core/design-system-registry";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { prepareWidgetVisualSettings } from "../../../overlay/core/widget-visual-settings";

export function isDesignCompatibleWithWidget(design: WidgetDesignV1, widget: WidgetInstanceV3): boolean {
  if (design.widgetType !== widget.type) {
    return false;
  }
  try {
    designSystemRegistry.resolve(design.systemId, design.systemVersion, design.widgetType);
    return true;
  } catch {
    return false;
  }
}

export function partitionApplyAllTargets(
  widgets: readonly WidgetInstanceV3[],
  design: WidgetDesignV1,
): { compatibleIds: string[]; skippedCount: number } {
  const sameType = widgets.filter((widget) => widget.type === design.widgetType);
  const compatibleIds = sameType
    .filter((widget) => isDesignCompatibleWithWidget(design, widget))
    .map((widget) => widget.id);
  return {
    compatibleIds,
    skippedCount: sameType.length - compatibleIds.length,
  };
}

export function buildUserDesignFromWidget(
  widget: WidgetInstanceV3,
  input: { id: string; name: string; includesContent: boolean },
): WidgetDesignV1 {
  const { settings } = prepareWidgetVisualSettings(widget);
  return {
    id: input.id,
    name: input.name,
    widgetType: widget.type,
    systemId: widget.visual.systemId,
    systemVersion: widget.visual.systemVersion,
    configVersion: widget.visual.configVersion,
    visual: structuredClone(settings),
    includesContent: input.includesContent,
    content: input.includesContent ? structuredClone(widget.content) : undefined,
    origin: "user",
  };
}

export function isActiveDesign(widget: WidgetInstanceV3, design: WidgetDesignV1): boolean {
  return widget.visual.provenance?.designId === design.id;
}