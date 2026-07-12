import type { ComponentType } from "react";
import { validateInspectorControls } from "../../core/inspector-control";
import type {
  DesignSystemDefinition,
  WidgetRendererProps,
} from "../../core/design-system-definition";
import { DeltaCrystal } from "./delta/DeltaCrystal";
import { migrateDeltaSettingsV1, parseDeltaSettings } from "./delta/delta-settings";
import { PedalsCrystal } from "./pedals/PedalsCrystal";
import { PedalsTelemetryCrystal } from "./pedals-telemetry/PedalsTelemetryCrystal";
import { PedalsTelemetryCompactCrystal } from "./pedals-telemetry-compact/PedalsTelemetryCompactCrystal";
import { RacingFlagsCrystal } from "./racing-flags/RacingFlagsCrystal";
import { BroadcastTowerCrystal } from "./broadcast-tower/BroadcastTowerCrystal";
import { HeadToHeadCrystal } from "./head-to-head/HeadToHeadCrystal";
import { RelativeCrystal } from "./relative/RelativeCrystal";
import { StandingsCrystal } from "./standings/StandingsCrystal";
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
  configVersion: 2,
  defaultSettings: {
    templateId: "delta-bar",
    showHeader: true,
  },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      ...migrateDeltaSettingsV1(settings),
      showHeader: true,
    }),
    1: (settings: Record<string, unknown>) => migrateDeltaSettingsV1(settings),
  },
  parseSettings: parseDeltaSettings,
  inspector: {
    appearance: deltaAppearanceControls,
  },
  Renderer: DeltaCrystal as ComponentType<WidgetRendererProps>,
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
  configVersion: 2,
  defaultSettings: {
    showSessionHeader: true,
    compactRows: false,
    templateId: "standings-vertical",
  },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      showSessionHeader: true,
      compactRows: false,
      ...settings,
    }),
    1: (settings: Record<string, unknown>) => ({
      ...settings,
      templateId: "standings-vertical",
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { showSessionHeader: true, compactRows: false, templateId: "standings-vertical" };
    }
    return {
      showSessionHeader: true,
      compactRows: false,
      templateId: "standings-vertical",
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: standingsAppearanceControls,
  },
  Renderer: StandingsCrystal as ComponentType<WidgetRendererProps>,
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
  configVersion: 2,
  defaultSettings: { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-vertical" },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      ...RELATIVE_DEFAULT_APPEARANCE,
      ...settings,
    }),
    1: (settings: Record<string, unknown>) => ({
      ...settings,
      templateId: "relative-vertical",
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-vertical" };
    }
    return {
      ...RELATIVE_DEFAULT_APPEARANCE,
      templateId: "relative-vertical",
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: relativeAppearanceControls,
  },
  Renderer: RelativeCrystal as ComponentType<WidgetRendererProps>,
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
  configVersion: 2,
  defaultSettings: { ...PEDALS_DEFAULT_APPEARANCE, templateId: "pedals" },
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({
      ...PEDALS_DEFAULT_APPEARANCE,
      ...settings,
    }),
    1: (settings: Record<string, unknown>) => ({
      ...settings,
      templateId: "pedals",
    }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return { ...PEDALS_DEFAULT_APPEARANCE, templateId: "pedals" };
    }
    return {
      ...PEDALS_DEFAULT_APPEARANCE,
      templateId: "pedals",
      ...(input as Record<string, unknown>),
    };
  },
  inspector: {
    appearance: pedalsAppearanceControls,
  },
  Renderer: PedalsCrystal as ComponentType<WidgetRendererProps>,
};

const pedalsTelemetryRegistration = {
  widgetType: "pedals-telemetry" as const,
  configVersion: 1,
  defaultSettings: {},
  configMigrations: {
    0: (settings: Record<string, unknown>) => ({ ...settings }),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};
  },
  inspector: { appearance: [] },
  Renderer: PedalsTelemetryCrystal as ComponentType<WidgetRendererProps>,
};

const pedalsTelemetryCompactRegistration = {
  widgetType: "pedals-telemetry-compact" as const,
  configVersion: 1,
  defaultSettings: {},
  configMigrations: { 0: (settings: Record<string, unknown>) => ({ ...settings }) },
  parseSettings(input: unknown): Record<string, unknown> {
    return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
  },
  inspector: { appearance: [] },
  Renderer: PedalsTelemetryCompactCrystal as ComponentType<WidgetRendererProps>,
};

const racingFlagsRegistration = { widgetType: "racing-flags" as const, configVersion: 1, defaultSettings: {}, configMigrations: { 0: (settings: Record<string, unknown>) => ({ ...settings }) }, parseSettings(input: unknown): Record<string, unknown> { return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {}; }, inspector: { appearance: [] }, Renderer: RacingFlagsCrystal as ComponentType<WidgetRendererProps> };
const broadcastTowerRegistration = { widgetType: "broadcast-tower" as const, configVersion: 1, defaultSettings: {}, configMigrations: { 0: (settings: Record<string, unknown>) => ({ ...settings }) }, parseSettings(input: unknown): Record<string, unknown> { return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {}; }, inspector: { appearance: [] }, Renderer: BroadcastTowerCrystal as ComponentType<WidgetRendererProps> };
const headToHeadRegistration = { widgetType: "head-to-head" as const, configVersion: 1, defaultSettings: {}, configMigrations: { 0: (settings: Record<string, unknown>) => ({ ...settings }) }, parseSettings(input: unknown): Record<string, unknown> { return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {}; }, inspector: { appearance: [] }, Renderer: HeadToHeadCrystal as ComponentType<WidgetRendererProps> };

export const vantareCrystalManifest: DesignSystemDefinition = {
  id: "vantare-crystal",
  version: 1,
  label: "Vantare Crystal",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [
    deltaRegistration,
    standingsRegistration,
    relativeRegistration,
    pedalsRegistration,
    pedalsTelemetryRegistration,
    pedalsTelemetryCompactRegistration,
    racingFlagsRegistration,
    broadcastTowerRegistration,
    headToHeadRegistration,
  ],
};
