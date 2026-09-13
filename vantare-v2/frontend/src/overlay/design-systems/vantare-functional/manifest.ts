import type { ComponentType } from "react";
import type { DesignSystemDefinition, WidgetRendererProps } from "../../core/design-system-definition";
import { DeltaFunctional } from "./DeltaFunctional";
import { PedalsFunctional } from "./PedalsFunctional";
import { RelativeFunctional } from "./RelativeFunctional";
import { StandingsFunctional } from "./StandingsFunctional";
import { FUNCTIONAL_DEFAULT_SETTINGS, FUNCTIONAL_INFO_METRICS, parseFunctionalSettings } from "./session-info-settings";

const infoOptions = FUNCTIONAL_INFO_METRICS.map((value) => ({ value, labelKey: `overlay.inspector.efficiency.info.${value}` }));

export const vantareFunctionalManifest: DesignSystemDefinition = {
  id: "vantare-functional",
  version: 1,
  label: "Efficiency",
  systemMigrations: { 0: (_widgetType, settings) => ({ ...settings }) },
  widgets: [
    {
      widgetType: "standings",
      configVersion: 1,
      defaultSettings: FUNCTIONAL_DEFAULT_SETTINGS,
      configMigrations: { 0: (settings) => ({ ...settings }) },
      parseSettings: parseFunctionalSettings,
      inspector: { appearance: [
        { kind: "toggle", id: "show-session-header", labelKey: "overlay.inspector.standings.showSessionHeader", path: "showSessionHeader", defaultValue: true },
        { kind: "toggle", id: "show-brand", labelKey: "overlay.inspector.standings.showBrand", path: "showBrand", defaultValue: false },
        { kind: "select", id: "header-first", labelKey: "overlay.inspector.efficiency.headerFirst", path: "headerFirst", options: infoOptions, defaultValue: FUNCTIONAL_DEFAULT_SETTINGS.headerFirst },
        { kind: "select", id: "header-second", labelKey: "overlay.inspector.efficiency.headerSecond", path: "headerSecond", options: infoOptions, defaultValue: FUNCTIONAL_DEFAULT_SETTINGS.headerSecond },
        { kind: "toggle", id: "show-session-footer", labelKey: "overlay.inspector.efficiency.showSessionFooter", path: "showSessionFooter", defaultValue: true },
        { kind: "select", id: "footer-first", labelKey: "overlay.inspector.efficiency.footerFirst", path: "footerFirst", options: infoOptions, defaultValue: FUNCTIONAL_DEFAULT_SETTINGS.footerFirst },
        { kind: "select", id: "footer-second", labelKey: "overlay.inspector.efficiency.footerSecond", path: "footerSecond", options: infoOptions, defaultValue: FUNCTIONAL_DEFAULT_SETTINGS.footerSecond },
      ] },
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
  ],
};
