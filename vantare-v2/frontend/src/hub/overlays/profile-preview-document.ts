import type { ProfileConfig } from "../../lib/profile";
import {
  parseProfileDocumentV3,
  type WidgetType,
  type ProfileDocumentV3,
  type WidgetInstanceV3,
} from "../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../overlay/core/widget-registry";

const WIDGET_TYPES = new Set<WidgetType>(["delta", "standings", "relative", "pedals"]);

function isWidgetType(type: string): type is WidgetType {
  return WIDGET_TYPES.has(type as WidgetType);
}

function mapLegacyWidget(widget: ProfileConfig["widgets"][number], zIndex: number): WidgetInstanceV3 | null {
  if (!isWidgetType(widget.type)) {
    return null;
  }

  const definition = widgetTypeRegistry.get(widget.type);
  const instance = definition.createDefault(widget.id);
  const position = widget.position ?? { x: 0, y: 0, w: instance.layout.w, h: instance.layout.h };

  return {
    ...instance,
    layout: {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      zIndex,
      aspectLocked: instance.layout.aspectLocked,
    },
    behavior: {
      enabled: widget.enabled !== false,
      updateHz: widget.updateHz ?? instance.behavior.updateHz,
    },
  };
}

export function buildPreviewDocumentFromProfileConfig(profile: ProfileConfig): ProfileDocumentV3 {
  const widgets = (profile.widgets ?? [])
    .map((widget, index) => mapLegacyWidget(widget, index))
    .filter((widget): widget is WidgetInstanceV3 => widget !== null);

  return parseProfileDocumentV3({
    schemaVersion: 3,
    id: profile.id,
    name: profile.name ?? profile.id,
    displayMode: profile.displayMode ?? "racing",
    monitorIndex: profile.monitorIndex ?? 0,
    layouts: {
      general: {
        type: "general",
        widgets,
      },
    },
  });
}

export function resolveProfilePreviewDocument(
  profile?: ProfileConfig | null,
  previewDocument?: ProfileDocumentV3 | null,
): ProfileDocumentV3 | null {
  if (previewDocument) {
    return previewDocument;
  }
  if (!profile || !Array.isArray(profile.widgets) || profile.widgets.length === 0) {
    return null;
  }
  return buildPreviewDocumentFromProfileConfig(profile);
}