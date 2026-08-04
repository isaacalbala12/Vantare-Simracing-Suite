import type { CSSProperties } from "react";
import type { DesignSystemId } from "../overlay/core/profile-document";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";
import { WidgetVisualHost } from "../overlay/core/WidgetVisualHost";
import {
  buildHarnessTelemetry,
  buildHarnessWidget,
  getCrystalHarnessDesign,
  HARNESS_WIDGETS,
  isHarnessVariant,
  isHarnessWidget,
  seedHarnessInputHistory,
  type HarnessVariant,
  type HarnessWidget,
  type CrystalHarnessDesignId,
} from "../overlay/authoring/fixtures/authoring-fixtures";
import { buildEngineerPresentationFixture } from "../engineer/engineer-presentation-fixtures";
import type { EngineerLocale, EngineerSeverity } from "../engineer/engineer-presentation-store";

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
  designId?: CrystalHarnessDesignId;
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

const SYSTEMS = new Set<HarnessSystem>(["vantare-original", "vantare-crystal"]);
const SESSIONS = new Set<MockSessionScenario>(["practice", "qualifying", "race"]);
const LOCATIONS = new Set<MockLocationScenario>(["track", "pits"]);
const STATES = new Set<MockDataState>(["ready", "stale", "disconnected", "error"]);
const SURFACES = new Set<HarnessSurface>(["studio", "desktop", "obs", "harness"]);
const ENGINEER_LOCALES = new Set<EngineerLocale>(["es", "en", "it", "pt-BR"]);
const ENGINEER_SEVERITIES = new Set<EngineerSeverity>(["info", "warning", "critical"]);

export function parseHarnessQuery(search: string): HarnessQuery | { error: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const widget = (params.get("widget") ?? DEFAULT_QUERY.widget) as HarnessWidget;
  const system = (params.get("system") ?? (widget === "engineer-radio" ? "vantare-crystal" : DEFAULT_QUERY.system)) as HarnessSystem;
  const session = (params.get("session") ?? DEFAULT_QUERY.session) as MockSessionScenario;
  const location = (params.get("location") ?? DEFAULT_QUERY.location) as MockLocationScenario;
  const state = (params.get("state") ?? DEFAULT_QUERY.state) as MockDataState;
  const surface = (params.get("surface") ?? DEFAULT_QUERY.surface) as HarnessSurface;
  const variant = (params.get("variant") ?? DEFAULT_QUERY.variant) as HarnessVariant;
  const designId = params.get("design") ?? undefined;
  const engineerLocale = (params.get("locale") ?? "es") as EngineerLocale;
  const engineerSeverity = (params.get("severity") ?? "critical") as EngineerSeverity;

  if (!isHarnessWidget(widget)) {
    return { error: `invalid widget parameter: ${widget}` };
  }
  if (!SYSTEMS.has(system)) {
    return { error: `invalid system parameter: ${system}` };
  }
  if (!SESSIONS.has(session)) {
    return { error: `invalid session parameter: ${session}` };
  }
  if (!LOCATIONS.has(location)) {
    return { error: `invalid location parameter: ${location}` };
  }
  if (!STATES.has(state)) {
    return { error: `invalid state parameter: ${state}` };
  }
  if (!SURFACES.has(surface)) {
    return { error: `invalid surface parameter: ${surface}` };
  }
  if (!isHarnessVariant(variant)) {
    return { error: `invalid variant parameter: ${variant}` };
  }
  if (!ENGINEER_LOCALES.has(engineerLocale)) return { error: `invalid locale parameter: ${engineerLocale}` };
  if (!ENGINEER_SEVERITIES.has(engineerSeverity)) return { error: `invalid severity parameter: ${engineerSeverity}` };

  if (designId) {
    const design = getCrystalHarnessDesign(designId);
    if (!design) {
      return { error: `invalid design parameter: ${designId}` };
    }
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

export function OverlayParityHarness({ query }: { query: HarnessQuery }) {
  const snapshot = buildHarnessTelemetry({
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    variant: query.variant,
    designId: query.designId,
  });
  const widget = buildHarnessWidget(query.widget, query.system, query.variant, query.designId);
  seedHarnessInputHistory(widget, snapshot);

  return (
    <div
      data-overlay-parity-stage
      data-overlay-parity-widget={query.widget}
      data-overlay-parity-system={query.system}
      data-overlay-parity-variant={query.variant}
      data-overlay-parity-design={query.designId ?? ""}
      style={{
        width: 1920,
        height: 1080,
        position: "relative",
        background: "transparent",
      }}
    >
      <div data-overlay-parity-surface-label>{query.surface}</div>
      <div
        data-overlay-parity-widget-frame
        style={
          {
            position: "absolute",
            left: `${widget.layout.x}px`,
            top: `${widget.layout.y}px`,
            width: `${widget.layout.w}px`,
            height: `${widget.layout.h}px`,
          } as CSSProperties
        }
      >
        <WidgetVisualHost
          widget={widget}
          snapshot={snapshot}
          renderMode={query.surface}
          runtime={query.widget === "engineer-radio" ? {
            engineerPresentation: query.state === "ready"
              ? buildEngineerPresentationFixture(query.engineerLocale ?? "es", query.engineerSeverity ?? "critical")
              : null,
          } : undefined}
        />
      </div>
    </div>
  );
}

export function OverlayParityHarnessPage({ search }: { search: string }) {
  const parsed = parseHarnessQuery(search);
  if ("error" in parsed) {
    return (
      <div data-overlay-parity-error role="alert">
        {parsed.error}
      </div>
    );
  }
  return <OverlayParityHarness query={parsed} />;
}

export { HARNESS_WIDGETS };
