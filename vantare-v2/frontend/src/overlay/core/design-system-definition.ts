import type { ComponentType } from "react";
import type { CoreWidgetType, DesignSystemId } from "./profile-document";
import type { WidgetViewModelBase } from "./widget-definition";

export type WidgetRendererProps<TModel extends WidgetViewModelBase = WidgetViewModelBase> = {
  model: TModel;
  settings: Readonly<Record<string, unknown>>;
  renderMode: "studio" | "desktop" | "obs" | "harness";
};

export type WidgetSystemRegistration = {
  widgetType: CoreWidgetType;
  configVersion: number;
  defaultSettings: Readonly<Record<string, unknown>>;
  configMigrations: Readonly<
    Record<number, (settings: Record<string, unknown>) => Record<string, unknown>>
  >;
  parseSettings(input: unknown): Record<string, unknown>;
  Renderer: ComponentType<WidgetRendererProps>;
};

export type DesignSystemDefinition = {
  id: DesignSystemId;
  version: number;
  label: string;
  systemMigrations: Readonly<
    Record<
      number,
      (widgetType: CoreWidgetType, settings: Record<string, unknown>) => Record<string, unknown>
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
  readonly widgetType: CoreWidgetType;

  constructor(systemId: DesignSystemId, version: number, widgetType: CoreWidgetType, message: string) {
    super(message);
    this.name = "DesignSystemResolutionError";
    this.systemId = systemId;
    this.version = version;
    this.widgetType = widgetType;
  }
}