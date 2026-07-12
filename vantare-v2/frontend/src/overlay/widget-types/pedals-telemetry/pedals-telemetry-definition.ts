import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import {
  buildPedalsTelemetryViewModel,
  type PedalsTelemetryViewModel,
} from "./pedals-telemetry-view-model";

export type PedalsTelemetryContent = {
  showPosition: boolean;
  showClutch: boolean;
};

const DEFAULT_CONTENT: PedalsTelemetryContent = {
  showPosition: true,
  showClutch: true,
};

const DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 300,
  h: 112,
  zIndex: 0,
  aspectLocked: false,
} as const;

const pedalsTelemetryInspector = {
  content: [
    {
      kind: "toggle" as const,
      id: "show-position",
      labelKey: "studio.v3.inspector.pedalsTelemetry.showPosition",
      path: "showPosition",
      defaultValue: true,
    },
    {
      kind: "toggle" as const,
      id: "show-clutch",
      labelKey: "studio.v3.inspector.pedalsTelemetry.showClutch",
      path: "showClutch",
      defaultValue: true,
    },
  ],
} as const;

validateInspectorControls(pedalsTelemetryInspector.content);

export const pedalsTelemetryDefinition: WidgetTypeDefinition<
  PedalsTelemetryContent,
  PedalsTelemetryViewModel
> = {
  type: "pedals-telemetry",
  labelKey: "studio.v3.widgetTypes.pedalsTelemetry",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 220, height: 84 },
    defaultSize: { width: DEFAULT_LAYOUT.w, height: DEFAULT_LAYOUT.h },
    requiredFeature: getWidgetRequiredFeature("pedals-telemetry"),
  },
  inspector: pedalsTelemetryInspector,
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "pedals-telemetry",
      layout: { ...DEFAULT_LAYOUT },
      behavior: { enabled: true, updateHz: 30 },
      content: { ...DEFAULT_CONTENT },
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent(input: unknown): PedalsTelemetryContent {
    if (input === undefined || input === null) return { ...DEFAULT_CONTENT };
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("pedals-telemetry content must be an object");
    }
    const value = input as Record<string, unknown>;
    if (
      (value.showPosition !== undefined && typeof value.showPosition !== "boolean") ||
      (value.showClutch !== undefined && typeof value.showClutch !== "boolean")
    ) {
      throw new Error("pedals-telemetry content flags must be boolean");
    }
    return {
      showPosition: value.showPosition ?? DEFAULT_CONTENT.showPosition,
      showClutch: value.showClutch ?? DEFAULT_CONTENT.showClutch,
    };
  },
  buildViewModel: buildPedalsTelemetryViewModel,
};
