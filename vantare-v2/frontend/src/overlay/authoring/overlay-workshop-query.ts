import type { DesignSystemId, WidgetType } from "../core/profile-document";
import type { AuthoringV2Scenario } from "./fixtures/authoring-v2-scenario-fixture";
import { isWorkshopV2Variant, type WorkshopV2Variant } from "./fixtures/authoring-v2-workshop-frame";
import { getAnimationScene } from "./fixtures/animation-scenes";
import { getOfficialDesign } from "../design-systems/official-designs";
import { designSystemRegistry } from "../core/design-system-registry";
import { parseStandingsEnduranceSettings } from "../design-systems/vantare-endurance/standings/standings-endurance-settings";
import { WIDGET_TYPES } from "../core/profile-document";
import { FUNCTIONAL_STUDY_MODULE_IDS, FUNCTIONAL_STUDY_SLOT_IDS, FUNCTIONAL_STUDY_STYLE_IDS, type FunctionalStudyStyleId } from "./functional-study-options";

export type OverlayWorkshopQuery = {
  widget: WidgetType;
  system: DesignSystemId;
  designId?: string;
  /** Piel de estudio Eficiencia v2 (ISA-1120); solo aplica en la variante
   * `standings-functional-study` y nunca se persiste en perfiles. */
  studyStyle?: FunctionalStudyStyleId;
  /** Columnas opcionales del estudio (gap/bestLap/lastLap/pit). Misma regla:
   *  solo dentro de `standings-functional-study`. */
  modules?: readonly string[];
  /** Huecos de datos del pie en standings/relative de Eficiencia. */
  slots?: readonly string[];
  state: AuthoringV2Scenario["state"];
  surface: "studio" | "desktop" | "obs" | "harness";
  variant: WorkshopV2Variant;
  session: AuthoringV2Scenario["session"];
  location: AuthoringV2Scenario["location"];
  background: "transparent" | "grid" | "solid" | "context";
  scale: number;
  width?: number;
  height?: number;
  preset: "720p" | "1080p" | "1440p";
  compare?: "studio" | "desktop" | "obs" | "harness";
  /** Named animation scene being previewed, and where its transport is parked. */
  sceneId?: string;
  sceneFrame?: number;
  /** Marca integrada: el selector del Workshop hace de autoridad local
   *  (ISA-1105: en producción la decisión la inyecta la política nativa). */
  brand?: "off";
  /**
   * Redline tower lab (ISA-1071, dev only). Applied as appearanceOverrides on
   * the scenario widget, so they travel the productive visual/settings
   * contract. Absent means historic rendering.
   */
  redlineTheme?: "classic" | "tower";
  redlineSelection?: "legacy" | "glow" | "frame" | "plate";
  redlineHeader?: "current" | "signature" | "session" | "compact";
  /** Background-surface alpha, 0.45..1. Absent means historic (opaque). */
  redlineOpacity?: number;
  redlineData?: "telemetry" | "reference";
};

export const DEFAULT_OVERLAY_WORKSHOP_QUERY: OverlayWorkshopQuery = {
  widget: "delta",
  system: "vantare-original",
  state: "ready",
  surface: "studio",
  variant: "default",
  session: "race",
  location: "track",
  background: "grid",
  scale: 1,
  preset: "1080p",
};

const DESIGN_SYSTEMS = new Set<DesignSystemId>(["vantare-original", "vantare-crystal", "vantare-endurance", "vantare-functional", "vantare-iracing"]);
const STATES = new Set<AuthoringV2Scenario["state"]>(["ready", "stale", "disconnected", "error"]);
const SURFACES = new Set<OverlayWorkshopQuery["surface"]>(["studio", "desktop", "obs", "harness"]);
const SESSIONS = new Set<AuthoringV2Scenario["session"]>(["practice", "qualifying", "race"]);
const LOCATIONS = new Set<AuthoringV2Scenario["location"]>(["track", "pits"]);
const BACKGROUNDS = new Set<OverlayWorkshopQuery["background"]>(["transparent", "grid", "solid", "context"]);
const PRESETS = new Set<OverlayWorkshopQuery["preset"]>(["720p", "1080p", "1440p"]);
const REDLINE_THEMES = new Set(["classic", "tower"]);
const REDLINE_SELECTIONS = new Set(["legacy", "glow", "frame", "plate"]);
const REDLINE_HEADERS = new Set(["current", "signature", "session", "compact"]);

export function parseOverlayWorkshopQuery(search: string): OverlayWorkshopQuery | { error: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const widget = (params.get("widget") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.widget) as WidgetType;
  const system = (params.get("system") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.system) as DesignSystemId;
  const state = (params.get("state") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.state) as AuthoringV2Scenario["state"];
  const surface = (params.get("surface") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.surface) as OverlayWorkshopQuery["surface"];
  const variant = (params.get("variant") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.variant) as WorkshopV2Variant;
  const designId = params.get("design") ?? undefined;
  const session = (params.get("session") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.session) as AuthoringV2Scenario["session"];
  const location = (params.get("location") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.location) as AuthoringV2Scenario["location"];
  const background = (params.get("background") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.background) as OverlayWorkshopQuery["background"];
  const preset = (params.get("preset") ?? DEFAULT_OVERLAY_WORKSHOP_QUERY.preset) as OverlayWorkshopQuery["preset"];
  const compare = params.get("compare") as OverlayWorkshopQuery["surface"] | null;
  const scaleRaw = params.get("scale") ?? String(DEFAULT_OVERLAY_WORKSHOP_QUERY.scale);
  const scale = Number(scaleRaw);
  const width = params.get("width");
  const height = params.get("height");

  if (!WIDGET_TYPES.has(widget)) return { error: `invalid widget parameter: ${widget}` };
  if (!DESIGN_SYSTEMS.has(system)) return { error: `invalid system parameter: ${system}` };
  // Eficiencia se ofrece en los widgets que declara su manifest — la lista no
  // se duplica aquí; el registro es la fuente de verdad.
  if (system === "vantare-functional" && !designSystemRegistry.get("vantare-functional", 1).widgets.some((entry) => entry.widgetType === widget)) {
    return { error: `vantare-functional does not support widget=${widget}` };
  }
  if (!STATES.has(state)) return { error: `invalid state parameter: ${state}` };
  if (!SURFACES.has(surface)) return { error: `invalid surface parameter: ${surface}` };
  if (!isWorkshopV2Variant(variant)) return { error: `invalid variant parameter: ${variant}` };
  if (variant === "standings-functional-study" && (widget !== "standings" || system !== "vantare-functional")) return { error: "standings-functional-study requires Functional Standings" };
  if (!SESSIONS.has(session)) return { error: `invalid session parameter: ${session}` };
  if (!LOCATIONS.has(location)) return { error: `invalid location parameter: ${location}` };
  if (!BACKGROUNDS.has(background)) return { error: `invalid background parameter: ${background}` };
  if (!PRESETS.has(preset)) return { error: `invalid preset parameter: ${preset}` };
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 2) return { error: `invalid scale parameter: ${scaleRaw}` };
  if (compare && !SURFACES.has(compare)) return { error: `invalid compare parameter: ${compare}` };
  const parsedWidth = width === null ? undefined : Number(width);
  const parsedHeight = height === null ? undefined : Number(height);
  if ((parsedWidth !== undefined && (!Number.isInteger(parsedWidth) || parsedWidth < 64 || parsedWidth > 3840))
    || (parsedHeight !== undefined && (!Number.isInteger(parsedHeight) || parsedHeight < 64 || parsedHeight > 2160))) {
    return { error: "invalid declared dimensions" };
  }
  if ((parsedWidth === undefined) !== (parsedHeight === undefined)) return { error: "width and height must be declared together" };

  if (designId) {
    const design = getOfficialDesign(designId);
    if (!design) return { error: `invalid design parameter: ${designId}` };
    if (design.widgetType !== widget) return { error: `design ${designId} requires widget=${design.widgetType}` };
    if (design.systemId !== system) return { error: `design ${designId} requires system=${design.systemId}` };
  }

  if (variant === "relative-fill" && widget !== "relative") {
    return { error: "relative-fill variant requires widget=relative" };
  }
  if (variant === "relative-multiclass" && widget !== "relative") {
    return { error: "relative-multiclass variant requires widget=relative" };
  }
  if (variant === "standings-stress60" && widget !== "standings") {
    return { error: "standings-stress60 variant requires widget=standings" };
  }
  if (variant === "standings-multiclass" && widget !== "standings") {
    return { error: "standings-multiclass variant requires widget=standings" };
  }
  if (variant === "standings-replay" && widget !== "standings") {
    return { error: "standings-replay variant requires widget=standings" };
  }
  if (
    (variant === "standings-minimal" || variant === "standings-all-columns") &&
    widget !== "standings"
  ) {
    return { error: `${variant} variant requires widget=standings` };
  }
  if ((variant === "pedals-zero" || variant === "pedals-full") && widget !== "pedals") {
    return { error: `${variant} variant requires widget=pedals` };
  }
  if (widget === "engineer-radio" && !["vantare-crystal", "vantare-functional"].includes(system)) {
    return { error: "engineer-radio requires system=vantare-crystal or vantare-functional" };
  }

  const sceneId = params.get("scene") ?? undefined;
  if (sceneId !== undefined) {
    const scene = getAnimationScene(sceneId);
    if (!scene) return { error: `invalid scene parameter: ${sceneId}` };
    if (scene.widget !== widget) return { error: `scene ${sceneId} requires widget=${scene.widget}` };
  }
  const sceneFrameRaw = params.get("frame");
  const sceneFrame = sceneFrameRaw === null ? undefined : Number(sceneFrameRaw);
  if (sceneFrame !== undefined && (!Number.isInteger(sceneFrame) || sceneFrame < 0)) {
    return { error: `invalid frame parameter: ${sceneFrameRaw}` };
  }

  // La piel de estudio solo tiene sentido dentro del estudio Eficiencia: un
  // valor desconocido es un error honesto, pero uno válido que sobrevive un
  // cambio de variante se descarta en silencio en vez de romper la página.
  const studyStyleRaw = params.get("study");
  if (studyStyleRaw !== null && !FUNCTIONAL_STUDY_STYLE_IDS.has(studyStyleRaw)) {
    return { error: `invalid study parameter: ${studyStyleRaw}` };
  }
  const studyStyle = studyStyleRaw !== null && variant === "standings-functional-study" && system === "vantare-functional"
    ? studyStyleRaw as FunctionalStudyStyleId
    : undefined;

  const brand = params.get("brand");
  if (brand !== null && brand !== "off") return { error: `invalid brand parameter: ${brand}` };

  // Módulos del estudio: misma regla que studyStyle — valor desconocido es
  // error honesto, uno válido fuera del estudio se descarta en silencio.
  const modulesRaw = params.get("modules");
  let modules: readonly string[] | undefined;
  if (modulesRaw !== null) {
    const list = modulesRaw.split(",").filter(Boolean);
    const unknown = list.find((id) => !FUNCTIONAL_STUDY_MODULE_IDS.has(id));
    if (unknown) return { error: `invalid modules parameter: ${modulesRaw}` };
    if (variant === "standings-functional-study" && system === "vantare-functional") {
      modules = list;
    }
  }

  // Slots del pie: cualquier variante funcional de standings/relative;
  // id desconocido es error honesto, fuera de esos widgets se descarta.
  const slotsRaw = params.get("slots");
  let slots: readonly string[] | undefined;
  if (slotsRaw !== null) {
    const list = slotsRaw.split(",").filter(Boolean);
    const unknown = list.find((id) => !FUNCTIONAL_STUDY_SLOT_IDS.has(id));
    if (unknown) return { error: `invalid slots parameter: ${slotsRaw}` };
    if (system === "vantare-functional" && (widget === "standings" || widget === "relative") && list.length > 0) {
      slots = list;
    }
  }

  // Tower lab options are validated here and applied as appearanceOverrides;
  // the productive settings parser re-validates them before rendering.
  const designSettings = parseStandingsEnduranceSettings(designId ? getOfficialDesign(designId)?.visual ?? {} : {});
  const towerDefaults = designSettings.redlineTheme === "tower" ? designSettings : undefined;
  const redlineThemeRaw = params.get("redlineTheme") ?? towerDefaults?.redlineTheme ?? null;
  const redlineData = params.get("redlineData");
  if (redlineData !== null && redlineData !== "telemetry" && redlineData !== "reference") return { error: `invalid redlineData parameter: ${redlineData}` };
  if (redlineThemeRaw !== null && !REDLINE_THEMES.has(redlineThemeRaw)) {
    return { error: `invalid redlineTheme parameter: ${redlineThemeRaw}` };
  }
  const redlineSelectionRaw = params.get("redlineSelection") ?? towerDefaults?.redlineSelection ?? null;
  if (redlineSelectionRaw !== null && !REDLINE_SELECTIONS.has(redlineSelectionRaw)) {
    return { error: `invalid redlineSelection parameter: ${redlineSelectionRaw}` };
  }
  const redlineHeaderRaw = params.get("redlineHeader") ?? towerDefaults?.redlineHeader ?? null;
  if (redlineHeaderRaw !== null && !REDLINE_HEADERS.has(redlineHeaderRaw)) {
    return { error: `invalid redlineHeader parameter: ${redlineHeaderRaw}` };
  }
  const redlineOpacityRaw = params.get("redlineOpacity");
  const redlineOpacity = redlineOpacityRaw === null ? towerDefaults?.redlineSurfaceOpacity : Number(redlineOpacityRaw);
  if (redlineOpacity !== undefined && (!Number.isFinite(redlineOpacity) || redlineOpacity < 0.45 || redlineOpacity > 1)) {
    return { error: `invalid redlineOpacity parameter: ${redlineOpacityRaw}` };
  }

  return { widget, system, state, surface, variant, session, location, background, scale, preset,
    ...(designId ? { designId } : {}), ...(studyStyle ? { studyStyle } : {}), ...(parsedWidth ? { width: parsedWidth } : {}), ...(parsedHeight ? { height: parsedHeight } : {}), ...(compare ? { compare } : {}),
    ...(sceneId ? { sceneId } : {}), ...(sceneFrame !== undefined ? { sceneFrame } : {}), ...(brand === "off" ? { brand } : {}), ...(modules ? { modules } : {}), ...(slots ? { slots } : {}),
    ...(redlineThemeRaw ? { redlineTheme: redlineThemeRaw as OverlayWorkshopQuery["redlineTheme"] } : {}),
    ...(redlineData ? { redlineData } : {}),
    ...(redlineSelectionRaw ? { redlineSelection: redlineSelectionRaw as OverlayWorkshopQuery["redlineSelection"] } : {}),
    ...(redlineHeaderRaw ? { redlineHeader: redlineHeaderRaw as OverlayWorkshopQuery["redlineHeader"] } : {}),
    ...(redlineOpacity !== undefined ? { redlineOpacity } : {}) };
}

export function isOverlayWorkshopPath(pathname: string, isDevelopment = import.meta.env.DEV): boolean {
  return isDevelopment && pathname === "/workshop";
}

export function serializeOverlayWorkshopQuery(query: OverlayWorkshopQuery): string {
  const params = new URLSearchParams({
    widget: query.widget,
    system: query.system,
    state: query.state,
    surface: query.surface,
    variant: query.variant,
    session: query.session,
    location: query.location,
    background: query.background,
    scale: String(query.scale),
    preset: query.preset,
  });
  if (query.designId) params.set("design", query.designId);
  if (query.studyStyle) params.set("study", query.studyStyle);
  if (query.width) params.set("width", String(query.width));
  if (query.height) params.set("height", String(query.height));
  if (query.compare) params.set("compare", query.compare);
  if (query.sceneId) params.set("scene", query.sceneId);
  if (query.sceneFrame !== undefined) params.set("frame", String(query.sceneFrame));
  if (query.brand) params.set("brand", query.brand);
  if (query.modules) params.set("modules", query.modules.join(","));
  if (query.slots) params.set("slots", query.slots.join(","));
  if (query.redlineTheme) params.set("redlineTheme", query.redlineTheme);
  if (query.redlineData) params.set("redlineData", query.redlineData);
  if (query.redlineSelection) params.set("redlineSelection", query.redlineSelection);
  if (query.redlineHeader) params.set("redlineHeader", query.redlineHeader);
  if (query.redlineOpacity !== undefined) params.set("redlineOpacity", String(query.redlineOpacity));
  return params.toString();
}
