import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetTypeDefinition } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import { buildBroadcastTowerViewModel, type BroadcastTowerViewModel } from "./broadcast-tower-view-model";

export type BroadcastTowerContent = { rowCount: number; showWeather: boolean; showSof: boolean };
const DEFAULT_CONTENT: BroadcastTowerContent = { rowCount: 5, showWeather: true, showSof: true };
const DEFAULT_LAYOUT = { x: 64, y: 64, w: 520, h: 260, zIndex: 0, aspectLocked: false } as const;
const inspector = { content: [
  { kind: "range" as const, id: "row-count", labelKey: "studio.v3.inspector.broadcastTower.rowCount", path: "rowCount", defaultValue: 5, min: 3, max: 10, step: 1 },
  { kind: "toggle" as const, id: "show-weather", labelKey: "studio.v3.inspector.broadcastTower.showWeather", path: "showWeather", defaultValue: true },
  { kind: "toggle" as const, id: "show-sof", labelKey: "studio.v3.inspector.broadcastTower.showSof", path: "showSof", defaultValue: true },
] } as const;
validateInspectorControls(inspector.content);
export const broadcastTowerDefinition: WidgetTypeDefinition<BroadcastTowerContent, BroadcastTowerViewModel> = {
  type: "broadcast-tower", labelKey: "studio.v3.widgetTypes.broadcastTower",
  capabilities: { inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"], supportsAspectUnlock: true, minimumSize: { width: 340, height: 150 }, defaultSize: { width: DEFAULT_LAYOUT.w, height: DEFAULT_LAYOUT.h }, requiredFeature: getWidgetRequiredFeature("broadcast-tower") }, inspector,
  createDefault(id: string): WidgetInstanceV3 { return { id, type: "broadcast-tower", layout: { ...DEFAULT_LAYOUT }, behavior: { enabled: true, updateHz: 10 }, content: { ...DEFAULT_CONTENT }, visual: { systemId: "vantare-original", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} } }; },
  parseContent(input: unknown): BroadcastTowerContent { if (input == null) return { ...DEFAULT_CONTENT }; if (typeof input !== "object" || Array.isArray(input)) throw new Error("broadcast-tower content must be an object"); const value = input as Record<string, unknown>; const rowCount = typeof value.rowCount === "number" && Number.isFinite(value.rowCount) ? Math.max(3, Math.min(10, Math.round(value.rowCount))) : 5; if (value.showWeather !== undefined && typeof value.showWeather !== "boolean") throw new Error("broadcast-tower showWeather must be boolean"); if (value.showSof !== undefined && typeof value.showSof !== "boolean") throw new Error("broadcast-tower showSof must be boolean"); return { rowCount, showWeather: typeof value.showWeather === "boolean" ? value.showWeather : true, showSof: typeof value.showSof === "boolean" ? value.showSof : true }; },
  buildViewModel: buildBroadcastTowerViewModel,
};
