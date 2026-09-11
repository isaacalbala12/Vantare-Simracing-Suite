import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { DeltaFunctional } from "./DeltaFunctional";
import { PedalsFunctional } from "./PedalsFunctional";
import { RelativeFunctional } from "./RelativeFunctional";
import { StandingsFunctional } from "./StandingsFunctional";

function parseShowHeader(input: unknown): Record<string, unknown> {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return { showHeader: value.showHeader !== false };
}

function headerInspector(labelKey: string) {
  return { appearance: [{ kind: "toggle", id: "show-header", labelKey, path: "showHeader", defaultValue: true }] } as const;
}

export const vantareFunctionalManifest: DesignSystemDefinition = {
  id: "vantare-functional",
  version: 1,
  label: "Efficiency",
  systemMigrations: { 0: (_widgetType, settings) => ({ ...settings }) },
  widgets: [
    {
      widgetType: "standings",
      configVersion: 1,
      defaultSettings: { showSessionHeader: true, templateId: "signature" },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown): Record<string, unknown> {
        const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
        return { showSessionHeader: value.showSessionHeader !== false, templateId: value.templateId === "broadcast" ? "broadcast" : "signature" };
      },
      inspector: { appearance: [{ kind: "toggle", id: "show-session-header", labelKey: "overlay.inspector.standings.showSessionHeader", path: "showSessionHeader", defaultValue: true }] },
      Renderer: StandingsFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "relative",
      configVersion: 1,
      defaultSettings: { showHeader: true },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings: parseShowHeader,
      inspector: headerInspector("overlay.inspector.relative.showHeader"),
      Renderer: RelativeFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "delta",
      configVersion: 1,
      defaultSettings: { showHeader: true },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings: parseShowHeader,
      inspector: headerInspector("overlay.inspector.delta.showHeader"),
      Renderer: DeltaFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "pedals",
      configVersion: 1,
      defaultSettings: { showHeader: true },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings: parseShowHeader,
      inspector: headerInspector("overlay.inspector.pedals.showHeader"),
      Renderer: PedalsFunctional as ComponentType<WidgetRendererProps>,
    },
  ],
};
