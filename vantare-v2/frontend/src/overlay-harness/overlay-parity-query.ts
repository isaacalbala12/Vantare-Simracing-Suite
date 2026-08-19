import type { EngineerLocale, EngineerSeverity } from "../engineer/engineer-presentation-store";
import type { DesignSystemId } from "../overlay/core/profile-document";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";
import {
  getCrystalHarnessDesign,
  isHarnessVariant,
  isHarnessWidget,
  type HarnessVariant,
  type HarnessWidget,
} from "../overlay/authoring/fixtures/authoring-fixtures";

export type HarnessSurface = "studio" | "desktop" | "obs" | "harness";
export type HarnessSystem = DesignSystemId;

export type HarnessQuery = {
  widget: HarnessWidget;
  system: HarnessSystem;
  session: MockSessionScenario;
  location: MockLocationScenario;
  state: MockDataState;
  surface: HarnessSurface;
  variant: HarnessVariant;
  designId?: string;
  engineerLocale?: EngineerLocale;
  engineerSeverity?: EngineerSeverity;
};

const DEFAULT_QUERY: HarnessQuery = {
  widget: "delta",
  system: "vantare-original",
  session: "race",
  location: "track",
  state: "ready",
  surface: "harness",
  variant: "default",
};

const DEFAULT_SYSTEM_BY_WIDGET: Partial<Record<HarnessWidget, HarnessSystem>> = {
  "engineer-radio": "vantare-crystal",
  "track-map": "vantare-endurance",
};

const SYSTEMS = new Set<HarnessSystem>([
  "vantare-original",
  "vantare-crystal",
  "vantare-endurance",
]);
const SESSIONS = new Set<MockSessionScenario>(["practice", "qualifying", "race"]);
const LOCATIONS = new Set<MockLocationScenario>(["track", "pits"]);
const STATES = new Set<MockDataState>(["ready", "stale", "disconnected", "error"]);
const SURFACES = new Set<HarnessSurface>(["studio", "desktop", "obs", "harness"]);
const ENGINEER_LOCALES = new Set<EngineerLocale>(["es", "en", "it", "pt-BR"]);
const ENGINEER_SEVERITIES = new Set<EngineerSeverity>(["info", "warning", "critical"]);

export function parseHarnessQuery(search: string): HarnessQuery | { error: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const widget = (params.get("widget") ?? DEFAULT_QUERY.widget) as HarnessWidget;
  const system = (params.get("system") ?? DEFAULT_SYSTEM_BY_WIDGET[widget] ?? DEFAULT_QUERY.system) as HarnessSystem;
  const session = (params.get("session") ?? DEFAULT_QUERY.session) as MockSessionScenario;
  const location = (params.get("location") ?? DEFAULT_QUERY.location) as MockLocationScenario;
  const state = (params.get("state") ?? DEFAULT_QUERY.state) as MockDataState;
  const surface = (params.get("surface") ?? DEFAULT_QUERY.surface) as HarnessSurface;
  const variant = (params.get("variant") ?? DEFAULT_QUERY.variant) as HarnessVariant;
  const designId = params.get("design") ?? undefined;
  const engineerLocale = (params.get("locale") ?? "es") as EngineerLocale;
  const engineerSeverity = (params.get("severity") ?? "critical") as EngineerSeverity;

  if (!isHarnessWidget(widget)) return { error: `invalid widget parameter: ${widget}` };
  if (!SYSTEMS.has(system)) return { error: `invalid system parameter: ${system}` };
  if (!SESSIONS.has(session)) return { error: `invalid session parameter: ${session}` };
  if (!LOCATIONS.has(location)) return { error: `invalid location parameter: ${location}` };
  if (!STATES.has(state)) return { error: `invalid state parameter: ${state}` };
  if (!SURFACES.has(surface)) return { error: `invalid surface parameter: ${surface}` };
  if (!isHarnessVariant(variant)) return { error: `invalid variant parameter: ${variant}` };
  if (!ENGINEER_LOCALES.has(engineerLocale)) return { error: `invalid locale parameter: ${engineerLocale}` };
  if (!ENGINEER_SEVERITIES.has(engineerSeverity)) return { error: `invalid severity parameter: ${engineerSeverity}` };

  if (designId) {
    const design = getCrystalHarnessDesign(designId);
    if (!design) return { error: `invalid design parameter: ${designId}` };
    if (system !== "vantare-crystal") {
      return { error: `design ${designId} requires system=vantare-crystal` };
    }
    if (design.widgetType !== widget) {
      return { error: `design ${designId} requires widget=${design.widgetType}` };
    }
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

  return {
    widget,
    system,
    session,
    location,
    state,
    surface,
    variant,
    ...(widget === "engineer-radio" || params.has("locale") ? { engineerLocale } : {}),
    ...(widget === "engineer-radio" || params.has("severity") ? { engineerSeverity } : {}),
    ...(designId ? { designId } : {}),
  };
}
