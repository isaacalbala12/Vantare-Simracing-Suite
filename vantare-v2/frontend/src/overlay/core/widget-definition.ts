import type { CoreWidgetType, WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

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
};

export type WidgetTypeDefinition<
  TContent extends Record<string, unknown>,
  TModel extends WidgetViewModelBase = WidgetViewModelBase,
> = {
  type: CoreWidgetType;
  labelKey: string;
  capabilities: WidgetCapabilities;
  createDefault(id: string): WidgetInstanceV3;
  parseContent(input: unknown): TContent;
  buildViewModel(snapshot: TelemetrySnapshot, content: TContent): TModel;
};