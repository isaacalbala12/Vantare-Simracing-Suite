import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { BroadcastTowerFunctional } from "./BroadcastTowerFunctional";
import { CarDamageNumbersFunctional } from "./CarDamageNumbersFunctional";
import { CarDamageVisualFunctional } from "./CarDamageVisualFunctional";
import { DeltaFunctional } from "./DeltaFunctional";
import { DeltaTraceFunctional } from "./DeltaTraceFunctional";
import { EngineerRadioFunctional } from "./EngineerRadioFunctional";
import { HeadToHeadFunctional } from "./HeadToHeadFunctional";
import { FuelStrategyFunctional } from "./FuelStrategyFunctional";
import { InputTelemetryFunctional } from "./InputTelemetryFunctional";
import { MulticlassRelativeFunctional } from "./MulticlassRelativeFunctional";
import { PedalsFunctional } from "./PedalsFunctional";
import { PedalsTelemetryFunctional } from "./PedalsTelemetryFunctional";
import { RacingFlagsFunctional } from "./RacingFlagsFunctional";
import { RaceScheduleFunctional } from "./RaceScheduleFunctional";
import { RelativeFunctional } from "./RelativeFunctional";
import { StandingsFunctional } from "./StandingsFunctional";
import { TrackMapFunctional } from "./TrackMapFunctional";
import { TrackWeatherFunctional } from "./TrackWeatherFunctional";

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
        return {
          showSessionHeader: value.showSessionHeader !== false,
          templateId: value.templateId === "broadcast" ? "broadcast" : "signature",
          // Preferencia de marca integrada (ISA-1105): nunca autoridad — la
          // decisión final llega como brandVisible desde la política nativa;
          // en el Workshop la escribe el selector de marca.
          showBrand: value.showBrand === true,
          ...(typeof value.brandVisible === "boolean" ? { brandVisible: value.brandVisible } : {}),
          // Huecos de datos del pie: solo ids string; el renderer resuelve
          // el vocabulario y no hay tope — la selección final la acota el
          // usuario en los ajustes de Overlay Studio.
          ...(Array.isArray(value.footerSlots) ? { footerSlots: value.footerSlots.filter((s): s is string => typeof s === "string") } : {}),
        };
      },
      inspector: { appearance: [{ kind: "toggle", id: "show-session-header", labelKey: "overlay.inspector.standings.showSessionHeader", path: "showSessionHeader", defaultValue: true }] },
      Renderer: StandingsFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "relative",
      configVersion: 1,
      // El relative de Eficiencia es solo la lista de filas: no hay cabecera
      // que conmutar, así que no ofrece ajustes de apariencia.
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: RelativeFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "delta",
      configVersion: 1,
      // El delta de Eficiencia no tiene cabecera: "instrument" (por defecto)
      // o "capsule" (dirección tipo Crystal) se eligen por diseño.
      defaultSettings: { templateId: "instrument" },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
        return { ...value, templateId: value.templateId === "capsule" ? "capsule" : "instrument" };
      },
      inspector: { appearance: [] },
      Renderer: DeltaFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "pedals",
      configVersion: 1,
      // Los pedales de Eficiencia son solo las barras: no hay cabecera que
      // conmutar.
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: PedalsFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "pedals-telemetry",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: PedalsTelemetryFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "track-weather",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: TrackWeatherFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "track-map",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: TrackMapFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "fuel-strategy",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: FuelStrategyFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "car-damage-numbers",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: CarDamageNumbersFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "input-telemetry",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: InputTelemetryFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "racing-flags",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: RacingFlagsFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "race-schedule",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: RaceScheduleFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "broadcast-tower",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: BroadcastTowerFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "multiclass-relative",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: MulticlassRelativeFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "car-damage-visual",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: CarDamageVisualFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "delta-trace",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: DeltaTraceFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "head-to-head",
      configVersion: 1,
      defaultSettings: { target: "ahead" },
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
        return {
          ...value,
          target: value.target === "behind" ? "behind" : "ahead",
        };
      },
      inspector: { appearance: [] },
      Renderer: HeadToHeadFunctional as ComponentType<WidgetRendererProps>,
    },
    {
      widgetType: "engineer-radio",
      configVersion: 1,
      defaultSettings: {},
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings(input: unknown) {
        return input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
      },
      inspector: { appearance: [] },
      Renderer: EngineerRadioFunctional as ComponentType<WidgetRendererProps>,
    },
  ],
};
