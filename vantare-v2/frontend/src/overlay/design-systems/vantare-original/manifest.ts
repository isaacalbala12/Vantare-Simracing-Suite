import type { ComponentType } from "react";
import { validateInspectorControls } from "../../core/inspector-control";
import type {
  DesignSystemDefinition,
  WidgetRendererProps,
} from "../../core/design-system-definition";
import { DeltaOriginal } from "./delta/DeltaOriginal";
import { StandingsOriginal } from "./standings/StandingsOriginal";

const deltaAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "show-header",
    labelKey: "overlay.inspector.delta.showHeader",
    path: "showHeader",
    defaultValue: true,
  },
];

validateInspectorControls(deltaAppearanceControls);

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
  inspector: {
    appearance: deltaAppearanceControls,
  },
  Renderer: DeltaOriginal as ComponentType<WidgetRendererProps>,
};

const standingsAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "show-session-header",
    labelKey: "overlay.inspector.standings.showSessionHeader",
    path: "showSessionHeader",
    defaultValue: true,
  },
  {
    kind: "toggle" as const,
    id: "compact-rows",
    labelKey: "overlay.inspector.standings.compactRows",
    path: "compactRows",
    defaultValue: false,
  },
];

validateInspectorControls(standingsAppearanceControls);

const standingsRegistration = {
  widgetType: "standings" as const,
  configVersion: 1,
  defaultSettings: {
    showSessionHeader: true,
    compactRows: false,
  },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      showSessionHeader: true,
      compactRows: false,
      ...settings,
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { showSessionHeader: true, compactRows: false };
    }
    return {
      showSessionHeader: true,
      compactRows: false,
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: standingsAppearanceControls,
  },
  Renderer: StandingsOriginal as ComponentType<WidgetRendererProps>,
};

export const vantareOriginalManifest: DesignSystemDefinition = {
  id: "vantare-original",
  version: 1,
  label: "Vantare Original",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [deltaRegistration, standingsRegistration],
};