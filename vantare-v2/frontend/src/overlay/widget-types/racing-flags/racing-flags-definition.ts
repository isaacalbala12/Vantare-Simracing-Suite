import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import { buildRacingFlagsViewModel, type RacingFlagsViewModel } from "./racing-flags-view-model";

export type RacingFlagsContent = { showSectorFlags: boolean; hideWhenGreen: boolean };
const DEFAULT_CONTENT: RacingFlagsContent = { showSectorFlags: true, hideWhenGreen: false };
const DEFAULT_LAYOUT = { x: 64, y: 64, w: 280, h: 88, zIndex: 0, aspectLocked: false } as const;
const inspector = { content: [
  { kind: "toggle" as const, id: "show-sector-flags", labelKey: "studio.v3.inspector.racingFlags.showSectorFlags", path: "showSectorFlags", defaultValue: true },
  { kind: "toggle" as const, id: "hide-when-green", labelKey: "studio.v3.inspector.racingFlags.hideWhenGreen", path: "hideWhenGreen", defaultValue: false },
] } as const;
validateInspectorControls(inspector.content);

export const racingFlagsDefinition: WidgetTypeDefinition<RacingFlagsContent, RacingFlagsViewModel> = {
  type: "racing-flags",
  labelKey: "studio.v3.widgetTypes.racingFlags",
  capabilities: { inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"], supportsAspectUnlock: true, minimumSize: { width: 180, height: 56 }, defaultSize: { width: DEFAULT_LAYOUT.w, height: DEFAULT_LAYOUT.h }, requiredFeature: getWidgetRequiredFeature("racing-flags") },
  inspector,
  createDefault(id: string): WidgetInstanceV3 { return { id, type: "racing-flags", layout: { ...DEFAULT_LAYOUT }, behavior: { enabled: true, updateHz: 10 }, content: { ...DEFAULT_CONTENT }, visual: { systemId: "vantare-original", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} } }; },
  parseContent(input: unknown): RacingFlagsContent {
    if (input == null) return { ...DEFAULT_CONTENT };
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("racing-flags content must be an object");
    const value = input as Record<string, unknown>;
    for (const key of ["showSectorFlags", "hideWhenGreen"] as const) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error("racing-flags content flags must be boolean");
    return { showSectorFlags: typeof value.showSectorFlags === "boolean" ? value.showSectorFlags : true, hideWhenGreen: typeof value.hideWhenGreen === "boolean" ? value.hideWhenGreen : false };
  },
  buildViewModel: buildRacingFlagsViewModel,
};
