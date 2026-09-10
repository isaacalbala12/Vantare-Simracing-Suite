import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { StandingsFunctional } from "./StandingsFunctional";

export const vantareFunctionalManifest: DesignSystemDefinition = {
  id: "vantare-functional",
  version: 1,
  label: "Vantare Functional · Preview",
  systemMigrations: { 0: (_widgetType, settings) => ({ ...settings }) },
  widgets: [{
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
  }],
};
