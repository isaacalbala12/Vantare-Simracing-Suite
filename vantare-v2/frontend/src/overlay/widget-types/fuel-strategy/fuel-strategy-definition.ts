import { validateInspectorControls } from "../../core/inspector-control";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import { getWidgetRequiredFeature, type WidgetTypeDefinition } from "../../core/widget-definition";
import { buildFuelStrategyViewModel, type FuelStrategyViewModel } from "./fuel-strategy-view-model";

export type FuelStrategyContent = { historyRows: number; units: "liters"; showProjection: boolean };
const DEFAULT_CONTENT: FuelStrategyContent = { historyRows: 4, units: "liters", showProjection: true };
const inspector = { content: [
  { kind: "range" as const, id: "history-rows", labelKey: "studio.v3.inspector.fuelStrategy.historyRows", path: "historyRows", defaultValue: 4, min: 1, max: 8, step: 1 },
  { kind: "toggle" as const, id: "show-projection", labelKey: "studio.v3.inspector.fuelStrategy.showProjection", path: "showProjection", defaultValue: true },
] };
validateInspectorControls(inspector.content);

export const fuelStrategyDefinition: WidgetTypeDefinition<FuelStrategyContent, FuelStrategyViewModel> = {
  type: "fuel-strategy",
  labelKey: "studio.v3.widgetTypes.fuelStrategy",
  capabilities: { inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"], supportsAspectUnlock: true, minimumSize: { width: 340, height: 150 }, defaultSize: { width: 680, height: 204 }, requiredFeature: getWidgetRequiredFeature("fuel-strategy") },
  inspector,
  createDefault(id: string): WidgetInstanceV3 { return { id, type: "fuel-strategy", layout: { x: 64, y: 64, w: 680, h: 204, zIndex: 0, aspectLocked: true }, behavior: { enabled: true, updateHz: 5 }, content: { ...DEFAULT_CONTENT }, visual: { systemId: "vantare-original", systemVersion: 1, configVersion: 1, baseSettings: {}, appearanceOverrides: {} } }; },
  parseContent(input: unknown): FuelStrategyContent {
    if (input == null) return { ...DEFAULT_CONTENT };
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("fuel-strategy content must be an object");
    const value = input as Record<string, unknown>;
    if (value.units !== undefined && value.units !== "liters") throw new Error("fuel-strategy units must be liters");
    if (value.showProjection !== undefined && typeof value.showProjection !== "boolean") throw new Error("fuel-strategy showProjection must be boolean");
    const rows = typeof value.historyRows === "number" && Number.isFinite(value.historyRows) ? Math.max(1, Math.min(8, Math.round(value.historyRows))) : 4;
    return { historyRows: rows, units: "liters", showProjection: typeof value.showProjection === "boolean" ? value.showProjection : true };
  },
  buildViewModel: buildFuelStrategyViewModel,
};
