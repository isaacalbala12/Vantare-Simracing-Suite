import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import {
  buildPedalsTelemetryCompactViewModel,
  type PedalsTelemetryCompactViewModel,
} from "./pedals-telemetry-compact-view-model";

export type PedalsTelemetryCompactContent = {
  showSpeed: boolean;
  showRpm: boolean;
  showClutch: boolean;
};

const DEFAULT_CONTENT: PedalsTelemetryCompactContent = {
  showSpeed: true,
  showRpm: true,
  showClutch: true,
};

const DEFAULT_LAYOUT = {
  x: 64,
  y: 64,
  w: 260,
  h: 92,
  zIndex: 0,
  aspectLocked: false,
} as const;

const compactInspector = {
  content: [
    { kind: "toggle" as const, id: "show-speed", labelKey: "studio.v3.inspector.pedalsTelemetryCompact.showSpeed", path: "showSpeed", defaultValue: true },
    { kind: "toggle" as const, id: "show-rpm", labelKey: "studio.v3.inspector.pedalsTelemetryCompact.showRpm", path: "showRpm", defaultValue: true },
    { kind: "toggle" as const, id: "show-clutch", labelKey: "studio.v3.inspector.pedalsTelemetryCompact.showClutch", path: "showClutch", defaultValue: true },
  ],
} as const;

validateInspectorControls(compactInspector.content);

export const pedalsTelemetryCompactDefinition: WidgetTypeDefinition<
  PedalsTelemetryCompactContent,
  PedalsTelemetryCompactViewModel
> = {
  type: "pedals-telemetry-compact",
  labelKey: "studio.v3.widgetTypes.pedalsTelemetryCompact",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 190, height: 68 },
    defaultSize: { width: DEFAULT_LAYOUT.w, height: DEFAULT_LAYOUT.h },
    requiredFeature: getWidgetRequiredFeature("pedals-telemetry-compact"),
  },
  inspector: compactInspector,
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "pedals-telemetry-compact",
      layout: { ...DEFAULT_LAYOUT },
      behavior: { enabled: true, updateHz: 30 },
      content: { ...DEFAULT_CONTENT },
      visual: { systemId: "vantare-original", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} },
    };
  },
  parseContent(input: unknown): PedalsTelemetryCompactContent {
    if (input === undefined || input === null) return { ...DEFAULT_CONTENT };
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("pedals-telemetry-compact content must be an object");
    const value = input as Record<string, unknown>;
    for (const key of ["showSpeed", "showRpm", "showClutch"] as const) {
      if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error("pedals-telemetry-compact content flags must be boolean");
    }
    return {
      showSpeed: typeof value.showSpeed === "boolean" ? value.showSpeed : DEFAULT_CONTENT.showSpeed,
      showRpm: typeof value.showRpm === "boolean" ? value.showRpm : DEFAULT_CONTENT.showRpm,
      showClutch: typeof value.showClutch === "boolean" ? value.showClutch : DEFAULT_CONTENT.showClutch,
    };
  },
  buildViewModel: buildPedalsTelemetryCompactViewModel,
};
