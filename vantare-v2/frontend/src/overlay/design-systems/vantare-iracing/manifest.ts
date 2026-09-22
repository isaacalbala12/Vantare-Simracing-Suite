import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { PedalsAdvancedIracing } from "./PedalsAdvancedIracing";

/**
 * Sistema de diseño "iRacing" (dev, ISA-1128): conserva la composición
 * original de Pedales Avanzados (pedals-telemetry-compact), con la paleta y
 * superficies sobrias de Eficiencia.
 */
export const vantareIracingManifest: DesignSystemDefinition = {
  id: "vantare-iracing",
  version: 1,
  label: "iRacing",
  systemMigrations: { 0: (_widgetType, settings) => ({ ...settings }) },
  widgets: [
    {
      widgetType: "pedals-telemetry-compact",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: PedalsAdvancedIracing as ComponentType<WidgetRendererProps>,
    },
  ],
};
