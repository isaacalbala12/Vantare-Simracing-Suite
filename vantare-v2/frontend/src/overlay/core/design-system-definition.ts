import type { ComponentType } from "react";
import type { InspectorCapability } from "./inspector-control";
import type { WidgetType, DesignSystemId } from "./profile-document";
import type { WidgetViewModelBase } from "./widget-definition";

export type WidgetRendererProps<TModel extends WidgetViewModelBase = WidgetViewModelBase> = {
  model: TModel;
  settings: Readonly<Record<string, unknown>>;
  renderMode: "studio" | "desktop" | "obs" | "harness";
};

export type WidgetSystemInspectorCapability = Pick<
  InspectorCapability,
  "appearance" | "CustomAppearanceInspector"
>;

export type WidgetSystemRegistration = {
  widgetType: WidgetType;
  configVersion: number;
  defaultSettings: Readonly<Record<string, unknown>>;
  configMigrations: Readonly<
    Record<number, (settings: Record<string, unknown>) => Record<string, unknown>>
  >;
  parseSettings(input: unknown): Record<string, unknown>;
  inspector: WidgetSystemInspectorCapability;
  Renderer: ComponentType<WidgetRendererProps>;
};

export type DesignSystemDefinition = {
  id: DesignSystemId;
  version: number;
  label: string;
  systemMigrations: Readonly<
    Record<
      number,
      (widgetType: WidgetType, settings: Record<string, unknown>) => Record<string, unknown>
    >
  >;
  widgets: readonly WidgetSystemRegistration[];
};

export type ResolvedWidgetSystem = WidgetSystemRegistration & {
  systemId: DesignSystemId;
  systemVersion: number;
};

export class DesignSystemResolutionError extends Error {
  readonly systemId: DesignSystemId;
  readonly version: number;
  readonly widgetType: WidgetType;

  constructor(systemId: DesignSystemId, version: number, widgetType: WidgetType, message: string) {
    super(message);
    this.name = "DesignSystemResolutionError";
    this.systemId = systemId;
    this.version = version;
    this.widgetType = widgetType;
  }
}