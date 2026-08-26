import type { ComponentType } from "react";
import { validateInspectorControls } from "../../core/inspector-control";
import type {
  DesignSystemDefinition,
  WidgetRendererProps,
} from "../../core/design-system-definition";
import { PEDALS_DEFAULT_APPEARANCE } from "../../widget-types/pedals/pedals-renderer-helpers";
import { RELATIVE_DEFAULT_APPEARANCE } from "../../widget-types/relative/relative-renderer-helpers";
import { STANDINGS_DEFAULT_APPEARANCE } from "../../widget-types/standings/standings-renderer-helpers";
import { DeltaEndurance } from "./delta/DeltaEndurance";
import {
  DELTA_ENDURANCE_DEFAULT_SETTINGS,
  normalizeDeltaEnduranceSettings,
} from "./delta/delta-endurance-settings";
import { PedalsEndurance } from "./pedals/PedalsEndurance";
import {
  PEDALS_ENDURANCE_DEFAULT_SETTINGS,
  normalizePedalsEnduranceSettings,
} from "./pedals/pedals-endurance-settings";
import { RelativeEndurance } from "./relative/RelativeEndurance";
import {
  RELATIVE_ENDURANCE_DEFAULT_SETTINGS,
  normalizeRelativeEnduranceSettings,
} from "./relative/relative-endurance-settings";
import { StandingsEndurance } from "./standings/StandingsEndurance";
import { TrackMapEndurance } from "./track-map/TrackMapEndurance";
import {
  TRACK_MAP_ENDURANCE_DEFAULT_SETTINGS,
  normalizeTrackMapEnduranceSettings,
} from "./track-map/track-map-endurance-settings";
import {
  STANDINGS_ENDURANCE_DEFAULT_SETTINGS,
  normalizeStandingsEnduranceSettings,
} from "./standings/standings-endurance-settings";

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
  defaultSettings: { ...DELTA_ENDURANCE_DEFAULT_SETTINGS },
  configMigrations: {
    0: (settings: Record<string, unknown>) => normalizeDeltaEnduranceSettings(settings),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return normalizeDeltaEnduranceSettings(input);
  },
  inspector: {
    appearance: deltaAppearanceControls,
  },
  Renderer: DeltaEndurance as ComponentType<WidgetRendererProps>,
};

const standingsAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "show-session-header",
    labelKey: "overlay.inspector.standings.showSessionHeader",
    path: "showSessionHeader",
    defaultValue: true,
  },
  // El acento no esta cableado en este sistema: el CSS de Endurance pinta con
  // `--ven-accent` y nunca lee `--vo-standings-accent`, asi que el control
  // movia un valor que no se veia. Vuelve cuando el sistema lo consuma.
  {
    kind: "color" as const,
    id: "class-hypercar-color",
    labelKey: "overlay.inspector.standings.classHypercarColor",
    path: "classHypercarColor",
    defaultValue: STANDINGS_DEFAULT_APPEARANCE.classHypercarColor,
  },
  {
    kind: "color" as const,
    id: "class-lmp2-color",
    labelKey: "overlay.inspector.standings.classLmp2Color",
    path: "classLmp2Color",
    defaultValue: STANDINGS_DEFAULT_APPEARANCE.classLmp2Color,
  },
  {
    kind: "color" as const,
    id: "class-lmp3-color",
    labelKey: "overlay.inspector.standings.classLmp3Color",
    path: "classLmp3Color",
    defaultValue: STANDINGS_DEFAULT_APPEARANCE.classLmp3Color,
  },
  {
    kind: "color" as const,
    id: "class-gt3-color",
    labelKey: "overlay.inspector.standings.classGt3Color",
    path: "classGt3Color",
    defaultValue: STANDINGS_DEFAULT_APPEARANCE.classGt3Color,
  },
  {
    kind: "color" as const,
    id: "class-unknown-color",
    labelKey: "overlay.inspector.standings.classUnknownColor",
    path: "classUnknownColor",
    defaultValue: STANDINGS_DEFAULT_APPEARANCE.classUnknownColor,
  },
];

validateInspectorControls(standingsAppearanceControls);

const standingsRegistration = {
  widgetType: "standings" as const,
  configVersion: 1,
  defaultSettings: { ...STANDINGS_ENDURANCE_DEFAULT_SETTINGS },
  configMigrations: {
    0: (settings: Record<string, unknown>) => normalizeStandingsEnduranceSettings(settings),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return normalizeStandingsEnduranceSettings(input);
  },
  inspector: {
    appearance: standingsAppearanceControls,
  },
  Renderer: StandingsEndurance as ComponentType<WidgetRendererProps>,
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
  defaultSettings: { ...RELATIVE_ENDURANCE_DEFAULT_SETTINGS },
  configMigrations: {
    0: (settings: Record<string, unknown>) => normalizeRelativeEnduranceSettings(settings),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return normalizeRelativeEnduranceSettings(input);
  },
  inspector: {
    appearance: relativeAppearanceControls,
  },
  Renderer: RelativeEndurance as ComponentType<WidgetRendererProps>,
};

const pedalsAppearanceControls = [
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
  defaultSettings: { ...PEDALS_ENDURANCE_DEFAULT_SETTINGS },
  configMigrations: {
    0: (settings: Record<string, unknown>) => normalizePedalsEnduranceSettings(settings),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return normalizePedalsEnduranceSettings(input);
  },
  inspector: {
    appearance: pedalsAppearanceControls,
  },
  Renderer: PedalsEndurance as ComponentType<WidgetRendererProps>,
};

const trackMapAppearanceControls = [
  {
    kind: "toggle" as const,
    id: "show-track-label",
    labelKey: "overlay.inspector.trackMap.showTrackLabel",
    path: "showTrackLabel",
    defaultValue: true,
  },
];

validateInspectorControls(trackMapAppearanceControls);

const trackMapRegistration = {
  widgetType: "track-map" as const,
  configVersion: 1,
  defaultSettings: { ...TRACK_MAP_ENDURANCE_DEFAULT_SETTINGS },
  configMigrations: {
    0: (settings: Record<string, unknown>) => normalizeTrackMapEnduranceSettings(settings),
  },
  parseSettings(input: unknown): Record<string, unknown> {
    return normalizeTrackMapEnduranceSettings(input);
  },
  inspector: {
    appearance: trackMapAppearanceControls,
  },
  Renderer: TrackMapEndurance as ComponentType<WidgetRendererProps>,
};

export const vantareEnduranceManifest: DesignSystemDefinition = {
  id: "vantare-endurance",
  version: 1,
  label: "Vantare Endurance",
  systemMigrations: {
    0: (_widgetType, settings) => ({ ...settings }),
  },
  widgets: [
    deltaRegistration,
    standingsRegistration,
    relativeRegistration,
    pedalsRegistration,
    trackMapRegistration,
  ],
};
