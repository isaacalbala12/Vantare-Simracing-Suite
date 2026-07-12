import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { ExampleRenderer } from "./ExampleRenderer";

const exampleRegistration = {
  widgetType: "delta" as const,
  configVersion: 1,
  defaultSettings: { label: "default" },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({ label: "default", ...settings }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return input && typeof input === "object" && !Array.isArray(input)
      ? { label: "default", ...(input as Record<string, unknown>) }
      : { label: "default" };
  },
  inspector: {
    appearance: [
      {
        kind: "text" as const,
        id: "label",
        labelKey: "studio.v3.template.label",
        path: "label",
        defaultValue: "default",
      },
    ],
  },
  Renderer: ExampleRenderer as ComponentType<WidgetRendererProps>,
};

/** Copy this folder before registering a real system. It is intentionally unregistered. */
export const exampleSystemManifest = {
  id: "example-system",
  version: 1,
  label: "Example system",
  systemMigrations: {
    0: (_widgetType: never, settings: Record<string, unknown>) => ({ ...settings }),
  },
  widgets: [exampleRegistration],
} as unknown as DesignSystemDefinition;
