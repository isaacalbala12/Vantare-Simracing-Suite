import crystalReferenceManifest from "../../testdata/crystal-reference/manifest.json";
import type { EngineerLocale, EngineerSeverity } from "../engineer/engineer-presentation-store";
import {
  AUTHORING_V2_VARIANTS,
  type AuthoringV2Variant,
} from "../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import { WIDGET_TYPES, type DesignSystemId, type WidgetType } from "../overlay/core/profile-document";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";

export type HarnessSurface = "studio" | "desktop" | "obs" | "harness";
export type HarnessSystem = DesignSystemId;
export type HarnessWidget = WidgetType;

// Parity solo admite variantes de forma/contenido sobre datos canónicos V2.
// Las que fabrican telemetría (relative-multiclass, standings-stress60,
// standings-replay, pedals-zero, pedals-full) se rechazan como invalid
// variant; siguen disponibles en Workshop sin tocar.
export type HarnessVariant = AuthoringV2Variant;

const PARITY_VARIANTS: ReadonlySet<string> = new Set(AUTHORING_V2_VARIANTS);

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

export function getCrystalParityDesign(designId: string):
  | { widgetType: string; designId: string; width: number; height: number }
  | undefined {
  return crystalReferenceManifest.entries.find((entry) => entry.designId === designId);
}

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

  if (!WIDGET_TYPES.has(widget)) return { error: `invalid widget parameter: ${widget}` };
  if (!SYSTEMS.has(system)) return { error: `invalid system parameter: ${system}` };
  if (!SESSIONS.has(session)) return { error: `invalid session parameter: ${session}` };
  if (!LOCATIONS.has(location)) return { error: `invalid location parameter: ${location}` };
  if (!STATES.has(state)) return { error: `invalid state parameter: ${state}` };
  if (!SURFACES.has(surface)) return { error: `invalid surface parameter: ${surface}` };
  if (!PARITY_VARIANTS.has(variant)) return { error: `invalid variant parameter: ${variant}` };
  if (!ENGINEER_LOCALES.has(engineerLocale)) return { error: `invalid locale parameter: ${engineerLocale}` };
  if (!ENGINEER_SEVERITIES.has(engineerSeverity)) return { error: `invalid severity parameter: ${engineerSeverity}` };

  if (designId) {
    const design = getCrystalParityDesign(designId);
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
  if (
    (variant === "standings-multiclass" ||
      variant === "standings-minimal" ||
      variant === "standings-all-columns") &&
    widget !== "standings"
  ) {
    return { error: `${variant} variant requires widget=standings` };
  }
  if (widget === "engineer-radio" && system !== "vantare-crystal") {
    return { error: "engineer-radio requires system=vantare-crystal" };
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
