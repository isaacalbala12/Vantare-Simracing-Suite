import { createElement } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";

function DeltaCrystalTestRenderer({ model }: WidgetRendererProps) {
  return createElement(
    "section",
    {
      "data-widget-system": "vantare-crystal",
      "data-widget-renderer": "delta",
      "data-status": model.status,
    },
    createElement("span", { "data-testid": "delta-crystal-test-renderer" }, model.type),
  );
}

const deltaRegistration = {
  widgetType: "delta" as const,
  configVersion: 1,
  defaultSettings: {
    showHeader: true,
  },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      showHeader: true,
      ...settings,
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { showHeader: true };
    }
    return {
      showHeader: true,
      ...(input as Record<string, unknown>),
    };
  },
  Renderer: DeltaCrystalTestRenderer,
};

export const vantareCrystalManifest: DesignSystemDefinition = {
  id: "vantare-crystal",
  version: 1,
  label: "Vantare Crystal",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [deltaRegistration],
};