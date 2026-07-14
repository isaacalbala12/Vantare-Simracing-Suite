import type { FeatureId } from "../../lib/access-policy";
import type { InspectorCapability } from "./inspector-control";
import type { WidgetType, WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

// Only registered widget definitions declare a feature gate. The vocabulary is
// intentionally broader while the remaining widget definitions land in later
// microplans, so keep this map partial instead of inventing placeholder gates.
export const WIDGET_REQUIRED_FEATURE_BY_TYPE: Partial<Record<WidgetType, FeatureId>> = {
  delta: "overlays.basic",
  standings: "overlays.basic",
  pedals: "overlays.basic",
  relative: "overlays.advanced",
  "pedals-telemetry": "overlays.advanced",
  "pedals-telemetry-compact": "overlays.advanced",
  "racing-flags": "overlays.advanced",
  "broadcast-tower": "overlays.advanced",
  "head-to-head": "overlays.advanced",
  "input-telemetry": "overlays.advanced",
  "multiclass-relative": "overlays.advanced",
  "delta-advanced": "overlays.advanced",
  "fuel-strategy": "overlays.advanced",
  "delta-trace": "overlays.advanced",
  "race-schedule": "overlays.advanced",
  "track-weather": "overlays.advanced",
  "car-damage-visual": "overlays.advanced",
  "car-damage-numbers": "overlays.advanced",
};

export function getWidgetRequiredFeature(type: WidgetType): FeatureId {
  const feature = WIDGET_REQUIRED_FEATURE_BY_TYPE[type];
  if (!feature) {
    throw new Error(`No feature gate registered for widget type: ${type}`);
  }
  return feature;
}

export type InspectorSectionId =
  | "design"
  | "appearance"
  | "content"
  | "behavior"
  | "layout"
  | "actions";

export type WidgetRuntimeStatus = "ready" | "missing" | "stale" | "disconnected" | "error";

export type WidgetViewModelBase = {
  type: WidgetType;
  status: WidgetRuntimeStatus;
  statusMessage?: string;
};

export type WidgetCapabilities = {
  inspectorSections: readonly InspectorSectionId[];
  supportsAspectUnlock: boolean;
  minimumSize: { width: number; height: number };
  defaultSize: { width: number; height: number };
  requiredFeature: FeatureId;
};

export type WidgetInspectorCapability = Pick<
  InspectorCapability,
  "content" | "CustomContentInspector"
>;

export type WidgetTypeDefinition<
  TContent extends Record<string, unknown>,
  TModel extends WidgetViewModelBase = WidgetViewModelBase,
> = {
  type: WidgetType;
  labelKey: string;
  capabilities: WidgetCapabilities;
  inspector: WidgetInspectorCapability;
  createDefault(id: string): WidgetInstanceV3;
  parseContent(input: unknown): TContent;
  buildViewModel(snapshot: TelemetrySnapshot, content: TContent): TModel;
};
