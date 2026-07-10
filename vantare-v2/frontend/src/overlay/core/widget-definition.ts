import type { FeatureId } from "../../lib/access-policy";
import type { InspectorCapability } from "./inspector-control";
import type { CoreWidgetType, WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

export const WIDGET_REQUIRED_FEATURE_BY_TYPE: Record<CoreWidgetType, FeatureId> = {
  delta: "overlays.basic",
  standings: "overlays.basic",
  pedals: "overlays.basic",
  relative: "overlays.advanced",
};

export function getWidgetRequiredFeature(type: CoreWidgetType): FeatureId {
  return WIDGET_REQUIRED_FEATURE_BY_TYPE[type];
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
  type: CoreWidgetType;
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
  type: CoreWidgetType;
  labelKey: string;
  capabilities: WidgetCapabilities;
  inspector: WidgetInspectorCapability;
  createDefault(id: string): WidgetInstanceV3;
  parseContent(input: unknown): TContent;
  buildViewModel(snapshot: TelemetrySnapshot, content: TContent): TModel;
};