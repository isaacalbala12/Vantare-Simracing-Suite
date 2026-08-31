import type { FeatureId } from "../../lib/access-policy";
import type { InspectorCapability } from "./inspector-control";
import type { WidgetType, WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";
import type { EngineerPresentation } from "../../engineer/engineer-presentation-store";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { OverlayV2Feature } from "../telemetry-shadow/overlay-v2-features";
import type { RelativeViewModelState } from "../widget-types/relative/relative-view-model-v2";

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
  "engineer-radio": "engineer.ai",
  "track-map": "overlays.advanced",
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

export type WidgetRuntimeInput = {
  engineerPresentation?: EngineerPresentation | null;
  engineerSubtitlesEnabled?: boolean;
  raceScheduleEvents?: readonly {
    id: string;
    title: string;
    track: string;
    startAt: string;
    durationMinutes: number;
    classes: readonly string[];
    status: string;
    license?: string;
  }[];
  raceScheduleStatus?: WidgetRuntimeStatus;
  overlayV2Features?: readonly OverlayV2Feature[];
  overlayV2Failure?: Readonly<{
    code: "invalid-frame" | "transport-error";
    message: string;
  }>;
  overlayV2Frame?: OverlayFrameV2;
  overlayV2Source?: OverlaySourceStatusV2;
  relativeViewModelState?: RelativeViewModelState;
  relativeViewModelNowMs?: () => number;
  relativeViewModelInstanceToken?: object;
};

export type WidgetRenderMode = "studio" | "desktop" | "obs" | "harness";

export type WidgetCapabilities = {
  inspectorSections: readonly InspectorSectionId[];
  supportsAspectUnlock: boolean;
  resizeMode?: "free" | "horizontal-only";
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
  buildRuntimeViewModel?(
    snapshot: TelemetrySnapshot,
    content: TContent,
    runtime: WidgetRuntimeInput,
  ): TModel;
  buildPreviewViewModel?(
    snapshot: TelemetrySnapshot,
    content: TContent,
    runtime: WidgetRuntimeInput,
  ): TModel;
  buildAuxiliaryViewModel?(
    content: TContent,
    runtime: WidgetRuntimeInput,
    renderMode: WidgetRenderMode,
  ): TModel;
};
