import type { WidgetInstanceV3 } from "../../core/profile-document";
import { getWidgetRequiredFeature, type WidgetTypeDefinition } from "../../core/widget-definition";
import type { RadarViewModel } from "./radar-view-model-v2";

export const radarDefinition: WidgetTypeDefinition<Record<string, unknown>, RadarViewModel> = {
  type: "radar",
  labelKey: "studio.v3.widgetTypes.radar",
  capabilities: {
    inspectorSections: ["design", "appearance", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 140, height: 140 },
    defaultSize: { width: 220, height: 220 },
    requiredFeature: getWidgetRequiredFeature("radar"),
  },
  inspector: { content: [] },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "radar",
      layout: { x: 64, y: 64, w: 220, h: 220, zIndex: 0, aspectLocked: true },
      behavior: { enabled: true, updateHz: 10 },
      content: {},
      visual: { systemId: "vantare-functional", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} },
    };
  },
  parseContent(input: unknown): Record<string, unknown> {
    if (input == null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("radar content must be an object");
    return {};
  },
};
