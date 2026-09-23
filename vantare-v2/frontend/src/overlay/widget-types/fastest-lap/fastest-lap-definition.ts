import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import { getWidgetRequiredFeature, type WidgetTypeDefinition } from "../../core/widget-definition";
import type { FastestLapViewModel } from "./fastest-lap-view-model";
import { parseFastestLapContent, type FastestLapContent } from "./fastest-lap-content";

const inspector = { content: [
  { kind: "toggle" as const, id: "personal", labelKey: "studio.v3.inspector.fastestLap.personal", path: "showPersonal", defaultValue: true },
  { kind: "toggle" as const, id: "class", labelKey: "studio.v3.inspector.fastestLap.class", path: "showClass", defaultValue: true },
  { kind: "range" as const, id: "duration", labelKey: "studio.v3.inspector.fastestLap.duration", path: "durationSeconds", min: 3, max: 15, step: 1, defaultValue: 6 },
  { kind: "toggle" as const, id: "show-driver", labelKey: "studio.v3.inspector.fastestLap.showDriver", path: "showDriver", defaultValue: true },
] };
validateInspectorControls(inspector.content);

export const fastestLapDefinition: WidgetTypeDefinition<FastestLapContent, FastestLapViewModel> = {
  type: "fastest-lap",
  labelKey: "studio.v3.widgetTypes.fastestLap",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 280, height: 72 },
    defaultSize: { width: 480, height: 104 },
    requiredFeature: getWidgetRequiredFeature("fastest-lap"),
  },
  inspector,
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id, type: "fastest-lap",
      layout: { x: 720, y: 48, w: 480, h: 104, zIndex: 0, aspectLocked: true },
      behavior: { enabled: true, updateHz: 10 },
      content: parseFastestLapContent(null),
      visual: { systemId: "vantare-functional", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} },
    };
  },
  parseContent: parseFastestLapContent,
};
