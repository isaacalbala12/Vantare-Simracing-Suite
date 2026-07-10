import type { ComponentType } from "react";
import { validateInspectorControls } from "../../core/inspector-control";
import type {
  DesignSystemDefinition,
  WidgetRendererProps,
} from "../../core/design-system-definition";
import { DeltaOriginal } from "./delta/DeltaOriginal";
import { PedalsOriginal } from "./pedals/PedalsOriginal";
import { RelativeOriginal } from "./relative/RelativeOriginal";
import { StandingsOriginal } from "./standings/StandingsOriginal";
import { PEDALS_DEFAULT_APPEARANCE } from "../../widget-types/pedals/pedals-renderer-helpers";
import { RELATIVE_DEFAULT_APPEARANCE } from "../../widget-types/relative/relative-renderer-helpers";

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

const relativeAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "show-header",
    labelKey: "overlay.inspector.relative.showHeader",
    path: "showHeader",
    defaultValue: true,
  },
  {
    kind: "color" as const,
    id: "accent-color",
    labelKey: "overlay.inspector.relative.accentColor",
    path: "accentColor",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.accentColor,
  },
  {
    kind: "color" as const,
    id: "gap-ahead-color",
    labelKey: "overlay.inspector.relative.gapAheadColor",
    path: "gapAheadColor",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.gapAheadColor,
  },
  {
    kind: "color" as const,
    id: "gap-behind-color",
    labelKey: "overlay.inspector.relative.gapBehindColor",
    path: "gapBehindColor",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.gapBehindColor,
  },
  {
    kind: "color" as const,
    id: "class-hypercar-color",
    labelKey: "overlay.inspector.relative.classHypercarColor",
    path: "classHypercarColor",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.classHypercarColor,
  },
  {
    kind: "color" as const,
    id: "class-lmp2-color",
    labelKey: "overlay.inspector.relative.classLmp2Color",
    path: "classLmp2Color",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.classLmp2Color,
  },
  {
    kind: "color" as const,
    id: "class-lmp3-color",
    labelKey: "overlay.inspector.relative.classLmp3Color",
    path: "classLmp3Color",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.classLmp3Color,
  },
  {
    kind: "color" as const,
    id: "class-gt3-color",
    labelKey: "overlay.inspector.relative.classGt3Color",
    path: "classGt3Color",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.classGt3Color,
  },
  {
    kind: "color" as const,
    id: "class-unknown-color",
    labelKey: "overlay.inspector.relative.classUnknownColor",
    path: "classUnknownColor",
    defaultValue: RELATIVE_DEFAULT_APPEARANCE.classUnknownColor,
  },
];

validateInspectorControls(relativeAppearanceControls);

const relativeRegistration = {
  widgetType: "relative" as const,
  configVersion: 1,
  defaultSettings: { ...RELATIVE_DEFAULT_APPEARANCE },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      ...RELATIVE_DEFAULT_APPEARANCE,
      ...settings,
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { ...RELATIVE_DEFAULT_APPEARANCE };
    }
    return {
      ...RELATIVE_DEFAULT_APPEARANCE,
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: relativeAppearanceControls,
  },
  Renderer: RelativeOriginal as ComponentType<WidgetRendererProps>,
};

const pedalsAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "transparent-background",
    labelKey: "overlay.inspector.pedals.transparentBackground",
    path: "transparentBackground",
    defaultValue: true,
  },
  {
    kind: "color" as const,
    id: "pedal-throttle-color",
    labelKey: "overlay.inspector.pedals.pedalThrottleColor",
    path: "pedalThrottleColor",
    defaultValue: PEDALS_DEFAULT_APPEARANCE.pedalThrottleColor,
  },
  {
    kind: "color" as const,
    id: "pedal-brake-color",
    labelKey: "overlay.inspector.pedals.pedalBrakeColor",
    path: "pedalBrakeColor",
    defaultValue: PEDALS_DEFAULT_APPEARANCE.pedalBrakeColor,
  },
  {
    kind: "color" as const,
    id: "pedal-clutch-color",
    labelKey: "overlay.inspector.pedals.pedalClutchColor",
    path: "pedalClutchColor",
    defaultValue: PEDALS_DEFAULT_APPEARANCE.pedalClutchColor,
  },
];

validateInspectorControls(pedalsAppearanceControls);

const pedalsRegistration = {
  widgetType: "pedals" as const,
  configVersion: 1,
  defaultSettings: { ...PEDALS_DEFAULT_APPEARANCE },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      ...PEDALS_DEFAULT_APPEARANCE,
      ...settings,
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { ...PEDALS_DEFAULT_APPEARANCE };
    }
    return {
      ...PEDALS_DEFAULT_APPEARANCE,
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: pedalsAppearanceControls,
  },
  Renderer: PedalsOriginal as ComponentType<WidgetRendererProps>,
};

export const vantareOriginalManifest: DesignSystemDefinition = {
  id: "vantare-original",
  version: 1,
  label: "Vantare Original",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [deltaRegistration, standingsRegistration, relativeRegistration, pedalsRegistration],
};