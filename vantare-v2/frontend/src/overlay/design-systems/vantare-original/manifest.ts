import { createElement } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";

function DeltaOriginalTestRenderer({ model }: WidgetRendererProps) {
  return createElement(
    "section",
    {
      "data-widget-system": "vantare-original",
      "data-widget-renderer": "delta",
      "data-status": model.status,
    },
    createElement("span", { "data-testid": "delta-original-test-renderer" }, model.type),
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
  Renderer: DeltaOriginalTestRenderer,
};

export const vantareOriginalManifest: DesignSystemDefinition = {
  id: "vantare-original",
  version: 1,
  label: "Vantare Original",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [deltaRegistration],
};