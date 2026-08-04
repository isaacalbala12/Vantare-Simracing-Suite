import type { DesignSystemId, WidgetType } from "../core/profile-document";
import type { MockDataState } from "../core/mock-scenarios";
import type { HarnessVariant } from "./fixtures/authoring-fixtures";
import { isHarnessVariant } from "./fixtures/authoring-fixtures";
import { getOfficialDesign } from "../design-systems/official-designs";
import { WIDGET_TYPES } from "../core/profile-document";

export type OverlayWorkshopQuery = {
  widget: WidgetType;
  system: DesignSystemId;
  designId?: string;
  state: MockDataState;
  surface: "studio" | "desktop" | "obs" | "harness";
  variant: HarnessVariant;
};

const DEFAULT_QUERY: OverlayWorkshopQuery = {
  widget: "delta",
  system: "vantare-original",
  state: "ready",
  surface: "studio",
  variant: "default",
};

const DESIGN_SYSTEMS = new Set<DesignSystemId>(["vantare-original", "vantare-crystal"]);
const STATES = new Set<MockDataState>(["ready", "stale", "disconnected", "error"]);
const SURFACES = new Set<OverlayWorkshopQuery["surface"]>(["studio", "desktop", "obs", "harness"]);

export function parseOverlayWorkshopQuery(search: string): OverlayWorkshopQuery | { error: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const widget = (params.get("widget") ?? DEFAULT_QUERY.widget) as WidgetType;
  const system = (params.get("system") ?? DEFAULT_QUERY.system) as DesignSystemId;
  const state = (params.get("state") ?? DEFAULT_QUERY.state) as MockDataState;
  const surface = (params.get("surface") ?? DEFAULT_QUERY.surface) as OverlayWorkshopQuery["surface"];
  const variant = (params.get("variant") ?? DEFAULT_QUERY.variant) as HarnessVariant;
  const designId = params.get("design") ?? undefined;

  if (!WIDGET_TYPES.has(widget)) return { error: `invalid widget parameter: ${widget}` };
  if (!DESIGN_SYSTEMS.has(system)) return { error: `invalid system parameter: ${system}` };
  if (!STATES.has(state)) return { error: `invalid state parameter: ${state}` };
  if (!SURFACES.has(surface)) return { error: `invalid surface parameter: ${surface}` };
  if (!isHarnessVariant(variant)) return { error: `invalid variant parameter: ${variant}` };

  if (designId) {
    const design = getOfficialDesign(designId);
    if (!design) return { error: `invalid design parameter: ${designId}` };
    if (design.widgetType !== widget) return { error: `design ${designId} requires widget=${design.widgetType}` };
    if (design.systemId !== system) return { error: `design ${designId} requires system=${design.systemId}` };
  }

  if (variant === "relative-fill" && widget !== "relative") {
    return { error: "relative-fill variant requires widget=relative" };
  }
  if (variant === "standings-stress60" && widget !== "standings") {
    return { error: "standings-stress60 variant requires widget=standings" };
  }
  if ((variant === "pedals-zero" || variant === "pedals-full") && widget !== "pedals") {
    return { error: `${variant} variant requires widget=pedals` };
  }
  if (widget === "engineer-radio" && system !== "vantare-crystal") {
    return { error: "engineer-radio requires system=vantare-crystal" };
  }

  return { widget, system, state, surface, variant, ...(designId ? { designId } : {}) };
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
  });
  if (query.designId) params.set("design", query.designId);
  return params.toString();
}
