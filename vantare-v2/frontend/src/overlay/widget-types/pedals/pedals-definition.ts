import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import { buildPedalsViewModel, type PedalsViewModel } from "./pedals-view-model";

export type PedalsContent = Record<string, never>;

const PEDALS_DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 120,
  h: 160,
  zIndex: 0,
  aspectLocked: true,
} as const;

const pedalsInspector = {
  content: [],
} as const;

validateInspectorControls(pedalsInspector.content);

export const pedalsDefinition: WidgetTypeDefinition<PedalsContent, PedalsViewModel> = {
  type: "pedals",
  labelKey: "overlay.widgets.pedals",
  capabilities: {
    inspectorSections: ["design", "appearance", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 72, height: 96 },
    defaultSize: { width: 120, height: 160 },
    requiredFeature: getWidgetRequiredFeature("pedals"),
  },
  inspector: pedalsInspector,
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "pedals",
      layout: { ...PEDALS_DEFAULT_LAYOUT },
      behavior: { enabled: true, updateHz: 30 },
      content: {},
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent(input: unknown): PedalsContent {
    if (input === undefined || input === null) {
      return {};
    }
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("pedals content must be an object");
    }
    const keys = Object.keys(input as Record<string, unknown>);
    if (keys.length > 0) {
      throw new Error("pedals content must be empty");
    }
    return {};
  },
  buildViewModel: buildPedalsViewModel,
};