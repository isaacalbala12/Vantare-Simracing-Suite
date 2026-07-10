import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { buildDeltaViewModel } from "./delta-view-model";
import type { DeltaViewModel } from "./delta-view-model";

export type DeltaContent = Record<string, never>;

const DELTA_DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 280,
  h: 96,
  zIndex: 0,
  aspectLocked: true,
} as const;

export const deltaDefinition: WidgetTypeDefinition<DeltaContent, DeltaViewModel> = {
  type: "delta",
  labelKey: "overlay.widgets.delta",
  capabilities: {
    inspectorSections: ["design", "appearance", "behavior", "layout", "actions"],
    supportsAspectUnlock: false,
    minimumSize: { width: 120, height: 48 },
    defaultSize: { width: 280, height: 96 },
  },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "delta",
      layout: { ...DELTA_DEFAULT_LAYOUT },
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
  parseContent(input: unknown): DeltaContent {
    if (input === undefined || input === null) {
      return {};
    }
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("delta content must be an object");
    }
    const keys = Object.keys(input as Record<string, unknown>);
    if (keys.length > 0) {
      throw new Error("delta content must be empty");
    }
    return {};
  },
  buildViewModel: buildDeltaViewModel,
};