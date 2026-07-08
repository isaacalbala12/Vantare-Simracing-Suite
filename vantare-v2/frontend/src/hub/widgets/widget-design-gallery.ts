import type {
  ColumnConfig,
  ProfileConfig,
  WidgetAppearance,
  WidgetConfig,
  WidgetVariantConfig,
} from "../../lib/profile";
import { applyPreset } from "../../lib/widget-presets";
import { withDefaultWidgetVariants } from "../../lib/widget-variants";

export type OfficialDesign = {
  id: string;
  name: string;
  description: string;
  widgetType: string;
  appearance: WidgetAppearance;
  variant?: {
    templateId?: string;
    themeId?: string;
    name?: string;
    columns?: ColumnConfig[];
    columnGroups?: WidgetVariantConfig["columnGroups"];
    filters?: Record<string, unknown>;
    formats?: Record<string, unknown>;
    slots?: WidgetVariantConfig["slots"];
  };
  props?: Record<string, unknown>;
};

export const RELATIVE_DEFAULT_TEMPLATE_ID = "relative-vantare-default";
export const STANDINGS_DEFAULT_TEMPLATE_ID = "standings-vantare-default";
export const DELTA_DEFAULT_TEMPLATE_ID = "delta-vantare-default";
export const PEDALS_DEFAULT_TEMPLATE_ID = "pedals-vantare-default";

function defaultRelativeColumns(): ColumnConfig[] {
  return [
    { id: "position", metricId: "position", enabled: true, width: 24, style: { align: "center" } },
    { id: "class", metricId: "class", enabled: true, width: 6, style: { align: "center" } },
    { id: "carNumber", metricId: "carNumber", enabled: true, width: 28, style: { align: "center" } },
    {
      id: "driverName",
      metricId: "driverName",
      enabled: true,
      width: 120,
      style: { align: "left" },
      format: { mode: "full", maxChars: 18 },
    },
    { id: "gap", metricId: "gap", enabled: true, width: 48, style: { align: "right" } },
    {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      width: 62,
      style: { align: "right" },
      format: { display: "full", decimals: 3 },
    },
    {
      id: "lastLap",
      metricId: "lastLap",
      enabled: true,
      width: 62,
      style: { align: "right" },
      format: { display: "full", decimals: 3 },
    },
  ];
}

function defaultStandingsColumns(): ColumnConfig[] {
  return [
    { id: "position", metricId: "position", enabled: true, width: 28 },
    { id: "driverNumber", metricId: "driverNumber", enabled: true, width: 42 },
    {
      id: "driverName",
      metricId: "driverName",
      enabled: true,
      width: 132,
      format: { mode: "full", maxChars: 16 },
      style: { align: "left" },
    },
    {
      id: "gap",
      metricId: "gap",
      enabled: true,
      width: 70,
      style: { align: "right" },
    },
    {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      width: 76,
      format: { display: "full", decimals: 3 },
      style: { align: "right" },
    },
    {
      id: "lastLap",
      metricId: "lastLap",
      enabled: true,
      width: 76,
      format: { display: "full", decimals: 3 },
      style: { align: "right" },
    },
    {
      id: "vehicleClass",
      metricId: "vehicleClass",
      enabled: false,
      width: 64,
    },
    {
      id: "currentLap",
      metricId: "currentLap",
      enabled: false,
      width: 52,
      style: { align: "right" },
    },
    {
      id: "interval",
      metricId: "interval",
      enabled: false,
      width: 70,
      style: { align: "right" },
    },
  ];
}

export const OFFICIAL_DESIGNS: OfficialDesign[] = [
  {
    id: "vantare-racing-essential",
    name: "Vantare Racing",
    description: "Columns base + mejor vuelta para carrera limpia.",
    widgetType: "relative",
    appearance: {
      accentColor: "#E63946",
      textColor: "#FFFFFF",
      backgroundColor: "#3a050a",
      borderColor: "#9b2226",
      gapAheadColor: "#f87171",
      gapBehindColor: "#4ade80",
      classHypercarColor: "#c1121f",
      classLmp2Color: "#0055A4",
      classLmp3Color: "#f59e0b",
      classGt3Color: "#2ecc71",
      classUnknownColor: "#6b7280",
    },
    variant: {
      templateId: RELATIVE_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-racing",
      columns: defaultRelativeColumns().map((column) =>
        column.id === "lastLap" ? { ...column, enabled: false } : column,
      ),
      filters: {
        rangeAhead: 3,
        rangeBehind: 3,
        classScope: "all",
        includePlayer: true,
        rowHeightMode: "fill",
      },
    },
  },
  {
    id: "broadcast-pro",
    name: "Broadcast Pro",
    description: "Mejor + última vuelta activas, fila compacta, multiclasse.",
    widgetType: "relative",
    appearance: {
      accentColor: "#FFB703",
      textColor: "#FBFBFB",
      backgroundColor: "#0b0b0d",
      borderColor: "#FFB703",
      gapAheadColor: "#FF6B6B",
      gapBehindColor: "#06D6A0",
      classHypercarColor: "#FFB703",
      classLmp2Color: "#118AB2",
      classLmp3Color: "#EF476F",
      classGt3Color: "#06D6A0",
      classUnknownColor: "#8d99ae",
    },
    variant: {
      templateId: RELATIVE_DEFAULT_TEMPLATE_ID,
      themeId: "broadcast-pro",
      columns: defaultRelativeColumns(),
      filters: {
        rangeAhead: 4,
        rangeBehind: 4,
        classScope: "sameClass",
        includePlayer: true,
        rowHeightMode: "compact",
      },
    },
  },
  {
    id: "standings-leaderboard",
    name: "Standings Leaderboard",
    description: "Posición, piloto, gap y mejor vuelta.",
    widgetType: "standings",
    appearance: {
      accentColor: "#9b2226",
      textColor: "#FFFFFF",
      backgroundColor: "#3a050a",
      borderColor: "#9b2226",
      posLeaderColor: "#f1c40f",
      pitColor: "#f1c40f",
      tireSoftColor: "#E63946",
      tireMediumColor: "#f1c40f",
      tireHardColor: "#ffffff",
    },
    variant: {
      templateId: STANDINGS_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-racing",
      columns: defaultStandingsColumns().map((column) =>
        column.id === "lastLap" ? { ...column, enabled: false } : column,
      ),
    },
  },
  {
    id: "standings-endurance",
    name: "Standings Endurance",
    description: "Incluye intervalo y vuelta actual para carreras largas.",
    widgetType: "standings",
    appearance: {
      accentColor: "#118AB2",
      textColor: "#F5F5F5",
      backgroundColor: "#0a1420",
      borderColor: "#118AB2",
      posLeaderColor: "#FFD166",
      pitColor: "#EF476F",
      tireSoftColor: "#EF476F",
      tireMediumColor: "#FFD166",
      tireHardColor: "#FAFAFA",
    },
    variant: {
      templateId: STANDINGS_DEFAULT_TEMPLATE_ID,
      themeId: "endurance",
      columns: defaultStandingsColumns().map((column) => {
        if (column.id === "interval") {
          return { ...column, enabled: true };
        }
        if (column.id === "currentLap") {
          return { ...column, enabled: true };
        }
        if (column.id === "lastLap") {
          return { ...column, enabled: true };
        }
        return column;
      }),
    },
  },
  {
    id: "delta-time-attack",
    name: "Delta Time Attack",
    description: "Negativo verde / positivo rojo, fondo negro puro.",
    widgetType: "delta",
    appearance: {
      positiveColor: "#e74c3c",
      negativeColor: "#2ecc71",
      textColor: "#FFFFFF",
      backgroundColor: "#000000",
      accentColor: "#FFFFFF",
      borderColor: "#1f1f1f",
    },
    variant: {
      templateId: DELTA_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-racing",
    },
  },
  {
    id: "delta-broadcast",
    name: "Delta Broadcast",
    description: "Alto contraste estilo retransmisión con borde ámbar.",
    widgetType: "delta",
    appearance: {
      positiveColor: "#FF6B6B",
      negativeColor: "#06D6A0",
      textColor: "#FFFFFF",
      backgroundColor: "#0b0b0d",
      accentColor: "#FFB703",
      borderColor: "#FFB703",
    },
    variant: {
      templateId: DELTA_DEFAULT_TEMPLATE_ID,
      themeId: "broadcast-pro",
    },
  },
  {
    id: "pedals-clean-broadcast",
    name: "Pedals Clean Broadcast",
    description: "Fondo transparente, paleta Vantare racing.",
    widgetType: "pedals",
    appearance: {
      accentColor: "#9b2226",
      textColor: "#FFFFFF",
      backgroundColor: "transparent",
      pedalThrottleColor: "#34d399",
      pedalBrakeColor: "#e63946",
      pedalClutchColor: "#3aa6c8",
    },
    variant: {
      templateId: PEDALS_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-racing",
    },
  },
  {
    id: "pedals-endurance",
    name: "Pedals Endurance",
    description: "Colores suaves para sesiones largas con fondo oscuro.",
    widgetType: "pedals",
    appearance: {
      accentColor: "#118AB2",
      textColor: "#F5F5F5",
      backgroundColor: "#0a1420",
      pedalThrottleColor: "#06D6A0",
      pedalBrakeColor: "#EF476F",
      pedalClutchColor: "#118AB2",
    },
    variant: {
      templateId: PEDALS_DEFAULT_TEMPLATE_ID,
      themeId: "endurance",
    },
  },
  {
    id: "relative-vantare-crystal",
    name: "Vantare Crystal",
    description: "Cristal oscuro, filas compactas y acentos rojos para relative.",
    widgetType: "relative",
    appearance: {
      accentColor: "#e63946",
      textColor: "#ffffff",
      backgroundColor: "#121216",
      borderColor: "rgba(255,255,255,0.09)",
      gapAheadColor: "#ff4d4d",
      gapBehindColor: "#34d399",
      classHypercarColor: "#ff2a3b",
      classLmp2Color: "#0055A4",
      classLmp3Color: "#f59e0b",
      classGt3Color: "#2ecc71",
      classUnknownColor: "#6b7280",
    },
    variant: {
      templateId: RELATIVE_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-crystal",
      columns: [
        { id: "position", metricId: "position", enabled: true, width: 36, style: { align: "center" } },
        { id: "class", metricId: "class", enabled: true, width: 6, style: { align: "center" } },
        { id: "carNumber", metricId: "carNumber", enabled: true, width: 44, style: { align: "center" } },
        { id: "driverName", metricId: "driverName", enabled: true, width: 140, style: { align: "left" }, format: { mode: "full", maxChars: 18 } },
        { id: "gap", metricId: "gap", enabled: true, width: 80, style: { align: "right" } },
        { id: "bestLap", metricId: "bestLap", enabled: true, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
        { id: "lastLap", metricId: "lastLap", enabled: false, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
      ],
      filters: {
        rangeAhead: 3,
        rangeBehind: 3,
        classScope: "all",
        includePlayer: true,
        rowHeightMode: "compact",
      },
    },
  },
  {
    id: "standings-vantare-crystal",
    name: "Standings Vantare Crystal",
    description: "Tabla vertical cristal con neumáticos, PIT y foco en líder.",
    widgetType: "standings",
    appearance: {
      accentColor: "#e63946",
      textColor: "#ffffff",
      backgroundColor: "#121216",
      borderColor: "rgba(255,255,255,0.09)",
      posLeaderColor: "#f1c40f",
      pitColor: "#f59e0b",
      tireSoftColor: "#ff4d4d",
      tireMediumColor: "#facc15",
      tireHardColor: "#ffffff",
    },
    variant: {
      templateId: STANDINGS_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-crystal",
      columns: [
        { id: "position", metricId: "position", enabled: true, width: 32, style: { align: "center" } },
        { id: "driverNumber", metricId: "driverNumber", enabled: true, width: 44, style: { align: "center" } },
        { id: "driverName", metricId: "driverName", enabled: true, width: 150, style: { align: "left" }, format: { mode: "full", maxChars: 16 } },
        { id: "gap", metricId: "gap", enabled: true, width: 100, style: { align: "right" } },
        { id: "lastLap", metricId: "lastLap", enabled: true, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
        { id: "bestLap", metricId: "bestLap", enabled: false, width: 80, style: { align: "right" }, format: { display: "full", decimals: 3 } },
        { id: "interval", metricId: "interval", enabled: false, width: 70, style: { align: "right" } },
        { id: "currentLap", metricId: "currentLap", enabled: false, width: 52, style: { align: "right" } },
      ],
    },
  },
  {
    id: "delta-vantare-crystal",
    name: "Delta Vantare Crystal",
    description: "Barra delta cristal con rojo positivo y verde negativo.",
    widgetType: "delta",
    appearance: {
      positiveColor: "#ff2a3b",
      negativeColor: "#22c55e",
      textColor: "#ffffff",
      backgroundColor: "#121216",
      accentColor: "#e63946",
      borderColor: "rgba(255,255,255,0.09)",
    },
    variant: {
      templateId: DELTA_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-crystal",
    },
  },
  {
    id: "pedals-vantare-crystal",
    name: "Pedals Vantare Crystal",
    description: "Pedales cristal de alto contraste con colores THR/BRK/CLT.",
    widgetType: "pedals",
    appearance: {
      accentColor: "#e63946",
      textColor: "#ffffff",
      backgroundColor: "transparent",
      borderColor: "rgba(255,255,255,0.09)",
      pedalThrottleColor: "#22c55e",
      pedalBrakeColor: "#ff2a3b",
      pedalClutchColor: "#f59e0b",
    },
    variant: {
      templateId: PEDALS_DEFAULT_TEMPLATE_ID,
      themeId: "vantare-crystal",
    },
  },
];

export type ApplyOfficialDesignResult = {
  widget: WidgetConfig;
  variant?: WidgetVariantConfig;
};

export function listOfficialDesigns(widgetType: string): OfficialDesign[] {
  if (!widgetType) return [];
  return OFFICIAL_DESIGNS.filter((design) => design.widgetType === widgetType);
}

export function getOfficialDesign(id: string): OfficialDesign | undefined {
  return OFFICIAL_DESIGNS.find((design) => design.id === id);
}

/**
 * Maps a widget to its active official design id, derived from `variantId`.
 * Official variants use the shape `official-<designId>-<widgetId>`.
 * Returns null for widgets without an official design applied.
 */
export function getActiveOfficialDesignId(widget: WidgetConfig | null): string | null {
  if (!widget?.variantId) return null;
  if (!widget.variantId.startsWith("official-")) return null;
  for (const design of OFFICIAL_DESIGNS) {
    if (widget.variantId.startsWith(`official-${design.id}-`)) return design.id;
  }
  return null;
}

/**
 * Reverts a widget that has an official design applied back to its default
 * (base) variant. Does NOT touch position, x, y, w, h, or any other field.
 */
export function resetWidgetDesignToBase(profile: ProfileConfig, widgetId: string): ProfileConfig {
  const widget = profile.widgets.find((w) => w.id === widgetId);
  if (!widget || !widget.variantId?.startsWith("official-")) return profile;

  const officialVariantId = widget.variantId;
  const variants = (profile.variants ?? []).filter((v) => v.id !== officialVariantId);
  const defaultVariantId = `variant-${widgetId}-default`;
  const widgets = profile.widgets.map((w) =>
    w.id === widgetId ? { ...w, variantId: defaultVariantId } : w,
  );
  return withDefaultWidgetVariants({ ...profile, widgets, variants });
}

export function applyOfficialDesign(
  widget: WidgetConfig,
  design: OfficialDesign,
): ApplyOfficialDesignResult {
  if (!widget || !design) {
    throw new Error("applyOfficialDesign: widget and design are required");
  }
  if (design.widgetType !== widget.type) {
    throw new Error(
      `Design type "${design.widgetType}" does not match widget type "${widget.type}"`,
    );
  }

  const variantId = `official-${design.id}-${widget.id}`;

  const syntheticPreset = {
    id: variantId,
    name: design.name,
    widgetType: design.widgetType,
    appearance: design.appearance,
    variant: design.variant,
    props: design.props,
    createdAt: "",
    updatedAt: "",
  };

  const result = applyPreset(widget, syntheticPreset);

  const mergedVariant: WidgetVariantConfig | undefined = result.variant
    ? {
        ...result.variant,
        id: variantId,
        widgetType: widget.type,
        name: design.name,
      }
    : undefined;

  return {
    widget: {
      ...result.widget,
      ...(mergedVariant ? { variantId: mergedVariant.id } : {}),
    },
    variant: mergedVariant,
  };
}

export function isOfficialDesignCompatible(design: OfficialDesign, widget: WidgetConfig | null): boolean {
  if (!widget) return false;
  return design.widgetType === widget.type;
}

export function applyOfficialDesignToProfile(
  profile: ProfileConfig,
  widgetId: string,
  design: OfficialDesign,
): ProfileConfig {
  const widget = profile.widgets.find((w) => w.id === widgetId);
  if (!widget) return profile;

  const { widget: newWidget, variant } = applyOfficialDesign(widget, design);

  let variants = profile.variants ?? [];
  if (variant) {
    const idsToExclude = new Set<string>([variant.id]);
    if (widget.variantId && widget.variantId !== variant.id) {
      idsToExclude.add(widget.variantId);
    }
    variants = variants.filter((v) => !idsToExclude.has(v.id));
    variants = [...variants, variant];
  }

  const widgets = profile.widgets.map((w) => (w.id === widgetId ? newWidget : w));
  return { ...profile, widgets, variants };
}