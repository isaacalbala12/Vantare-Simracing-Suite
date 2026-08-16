import type { WidgetType } from "../core/profile-document";
import { validateWidgetDesign, type WidgetDesignV1 } from "../core/widget-design";
import { PEDALS_DEFAULT_APPEARANCE } from "../widget-types/pedals/pedals-renderer-helpers";
import { RELATIVE_DEFAULT_APPEARANCE } from "../widget-types/relative/relative-renderer-helpers";
import { RELATIVE_REDLINE_CLASS_COLORS } from "./vantare-endurance/relative/relative-redline-shared";

export const OFFICIAL_DESIGNS_SECTION_LABEL = "Diseños de Vantare";

const OFFICIAL_DESIGN_DEFINITIONS: WidgetDesignV1[] = [
  {
    id: "delta-original-base",
    name: "Original Base",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: true },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "delta-crystal-bar",
    name: "Crystal Bar",
    widgetType: "delta",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: { templateId: "delta-bar", showHeader: true },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "delta-time-attack",
    name: "Time Attack",
    widgetType: "delta",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showHeader: false, accent: "amber" },
    includesContent: false,
    origin: "vantare",
  },
  {
    id: "delta-crystal-simple",
    name: "Crystal Simple",
    widgetType: "delta",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: { templateId: "delta-simple", showHeader: true },
    includesContent: false,
    origin: "vantare",
    // Sustituido por delta-crystal-bar. Se conserva la entrada para que los
    // perfiles guardados sigan resolviendo su diseno; migrateRetiredDesignId
    // los reescribe al cargarlos.
    retired: true,
  },
  {
    id: "standings-original-base",
    name: "Original Base",
    widgetType: "standings",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { showSessionHeader: true, compactRows: false },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "standings-crystal-vertical",
    name: "Crystal Vertical",
    widgetType: "standings",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: { showSessionHeader: true, compactRows: false, templateId: "standings-vertical" },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "relative-original-base",
    name: "Original Base",
    widgetType: "relative",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...RELATIVE_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "relative-crystal-vertical",
    name: "Crystal Vertical",
    widgetType: "relative",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-vertical" },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-original-base",
    name: "Original Base",
    widgetType: "pedals",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: { ...PEDALS_DEFAULT_APPEARANCE },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-crystal",
    name: "Crystal V3",
    widgetType: "pedals",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: {
      ...PEDALS_DEFAULT_APPEARANCE,
      pedalThrottleColor: "#22c55e",
      pedalBrakeColor: "#ff2a3b",
      pedalClutchColor: "#f59e0b",
      templateId: "pedals",
    },
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-telemetry-original",
    name: "Original Telemetry",
    widgetType: "pedals-telemetry",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-telemetry-crystal",
    name: "Crystal V1 Capsule",
    widgetType: "pedals-telemetry",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-telemetry-compact-original",
    name: "Original Compact Telemetry",
    widgetType: "pedals-telemetry-compact",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "pedals-telemetry-compact-crystal",
    name: "Crystal V2 Low Profile",
    widgetType: "pedals-telemetry-compact",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "racing-flags-original",
    name: "Original Racing Flags",
    widgetType: "racing-flags",
    systemId: "vantare-original",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  {
    id: "racing-flags-crystal",
    name: "Crystal Racing Flags",
    widgetType: "racing-flags",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 1,
    visual: {},
    includesContent: false,
    origin: "vantare",
    isDefault: true,
  },
  { id: "broadcast-tower-original", name: "Original Broadcast Tower", widgetType: "broadcast-tower", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "broadcast-tower-crystal", name: "Crystal Broadcast Tower", widgetType: "broadcast-tower", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "head-to-head-original", name: "Original Head to Head", widgetType: "head-to-head", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "head-to-head-crystal", name: "Crystal Head to Head", widgetType: "head-to-head", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "input-telemetry-original", name: "Original Input Telemetry", widgetType: "input-telemetry", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "input-crystal-blade", name: "Crystal Input Blade", widgetType: "input-telemetry", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: { templateId: "input-blade" }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "input-crystal-capsule", name: "Crystal Input Capsule", widgetType: "input-telemetry", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: { templateId: "input-capsule" }, includesContent: false, origin: "vantare" },
  { id: "input-crystal-dense", name: "Crystal Input Dense", widgetType: "input-telemetry", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: { templateId: "input-dense" }, includesContent: false, origin: "vantare" },
  { id: "multiclass-relative-original", name: "Original Multiclass Relative", widgetType: "multiclass-relative", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "multiclass-relative-crystal", name: "Crystal Multiclass Relative", widgetType: "multiclass-relative", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "delta-advanced-original", name: "Original Delta Advanced", widgetType: "delta-advanced", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "delta-advanced-crystal", name: "Crystal Delta Advanced", widgetType: "delta-advanced", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "fuel-strategy-original", name: "Original Fuel Strategy", widgetType: "fuel-strategy", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "fuel-strategy-crystal-unified", name: "Crystal Fuel Strategy", widgetType: "fuel-strategy", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "delta-trace-original", name: "Original Delta Trace", widgetType: "delta-trace", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "delta-trace-crystal", name: "Crystal Delta Trace", widgetType: "delta-trace", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "race-schedule-original", name: "Original Race Schedule", widgetType: "race-schedule", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "race-schedule-crystal", name: "Crystal Race Schedule", widgetType: "race-schedule", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "track-weather-original", name: "Original Track Weather", widgetType: "track-weather", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "track-weather-crystal", name: "Crystal Track Weather", widgetType: "track-weather", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "car-damage-visual-original", name: "Original Car Damage Visual", widgetType: "car-damage-visual", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "car-damage-visual-crystal", name: "Crystal Car Damage Visual", widgetType: "car-damage-visual", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "car-damage-numbers-original", name: "Original Car Damage Numbers", widgetType: "car-damage-numbers", systemId: "vantare-original", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "car-damage-numbers-crystal", name: "Crystal Car Damage Numbers", widgetType: "car-damage-numbers", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "engineer-radio-crystal", name: "Crystal Engineer Radio", widgetType: "engineer-radio", systemId: "vantare-crystal", systemVersion: 1, configVersion: 1, visual: {}, includesContent: false, origin: "vantare", isDefault: true },
  { id: "track-map-endurance-outline", name: "Endurance Outline", widgetType: "track-map", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "track-map-outline", showTrackLabel: true }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "delta-endurance-strip", name: "Endurance Strip", widgetType: "delta", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "delta-strip", showHeader: true }, includesContent: false, origin: "vantare" },
  { id: "delta-endurance-block", name: "Endurance Block", widgetType: "delta", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "delta-block", showHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-tower", name: "Endurance Tower", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-tower", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-strip", name: "Endurance Strip", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-strip", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-f1", name: "Endurance F1", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-f1", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-wec", name: "Endurance WEC", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-wec", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-lmu", name: "Endurance LMU", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-lmu", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-racelabs", name: "Endurance Racelabs", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-racelabs", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-apex", name: "Endurance Apex", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-apex", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-neo", name: "Endurance Neo", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-neo", showSessionHeader: true }, includesContent: false, origin: "vantare" },
  { id: "standings-endurance-redline", name: "Endurance Redline", widgetType: "standings", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "standings-redline", showSessionHeader: true }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "relative-endurance-classic", name: "Endurance Classic", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-classic" }, includesContent: false, origin: "vantare" },
  { id: "relative-endurance-minimal", name: "Endurance Minimal", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-minimal" }, includesContent: false, origin: "vantare" },
  { id: "pedals-endurance", name: "Endurance Pedals", widgetType: "pedals", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...PEDALS_DEFAULT_APPEARANCE, templateId: "pedals-classic" }, includesContent: false, origin: "vantare" },
  { id: "relative-endurance-neo", name: "Endurance Neo", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, templateId: "relative-neo" }, includesContent: false, origin: "vantare" },
  { id: "delta-endurance-neo", name: "Endurance Neo", widgetType: "delta", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "delta-neo", showHeader: true }, includesContent: false, origin: "vantare" },
  { id: "delta-endurance-redline", name: "Endurance Redline", widgetType: "delta", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { templateId: "delta-redline", showHeader: true }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "pedals-endurance-neo", name: "Endurance Neo", widgetType: "pedals", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...PEDALS_DEFAULT_APPEARANCE, templateId: "pedals-neo" }, includesContent: false, origin: "vantare" },
  { id: "pedals-endurance-redline", name: "Endurance Redline", widgetType: "pedals", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...PEDALS_DEFAULT_APPEARANCE, templateId: "pedals-redline" }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "relative-endurance-redline-mirror", name: "Endurance Redline Mirror", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, ...RELATIVE_REDLINE_CLASS_COLORS, templateId: "relative-redline-mirror" }, includesContent: false, origin: "vantare", isDefault: true },
  { id: "relative-endurance-redline-proximity", name: "Endurance Redline Proximity", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, ...RELATIVE_REDLINE_CLASS_COLORS, templateId: "relative-redline-proximity" }, includesContent: false, origin: "vantare" },
  { id: "relative-endurance-redline-traffic", name: "Endurance Redline Traffic", widgetType: "relative", systemId: "vantare-endurance", systemVersion: 1, configVersion: 1, visual: { ...RELATIVE_DEFAULT_APPEARANCE, ...RELATIVE_REDLINE_CLASS_COLORS, templateId: "relative-redline-traffic" }, includesContent: false, origin: "vantare" },
];

const OFFICIAL_DESIGNS: WidgetDesignV1[] = OFFICIAL_DESIGN_DEFINITIONS.map((design) =>
  validateWidgetDesign(design),
);

const OFFICIAL_BY_ID = new Map(OFFICIAL_DESIGNS.map((design) => [design.id, design]));

// El catalogo es lo que se ofrece: los retirados no aparecen. getOfficialDesign
// si los resuelve, para que un perfil que aun los referencie no se quede sin
// diseno mientras la migracion no lo haya reescrito.
export function listOfficialDesigns(widgetType?: WidgetType): WidgetDesignV1[] {
  const offered = OFFICIAL_DESIGNS.filter((design) => design.retired !== true);
  if (!widgetType) {
    return offered;
  }
  return offered.filter((design) => design.widgetType === widgetType);
}

// Catalogo completo, retirados incluidos. Para comprobaciones de cobertura
// -- que todo diseno de referencia siga teniendo entrada -- no para ofrecer.
export function listAllOfficialDesigns(widgetType?: WidgetType): WidgetDesignV1[] {
  if (!widgetType) {
    return [...OFFICIAL_DESIGNS];
  }
  return OFFICIAL_DESIGNS.filter((design) => design.widgetType === widgetType);
}

// Diseno retirado -> sustituto vigente. Al cargar un perfil, un id retirado se
// reescribe aqui para que el usuario no vea una variante que ya no ofrecemos.
const RETIRED_DESIGN_REPLACEMENTS: Readonly<Record<string, string>> = {
  "delta-crystal-simple": "delta-crystal-bar",
};

export function migrateRetiredDesignId(designId: string): string {
  return RETIRED_DESIGN_REPLACEMENTS[designId] ?? designId;
}

export function getOfficialDesign(id: string): WidgetDesignV1 | undefined {
  return OFFICIAL_BY_ID.get(id);
}
