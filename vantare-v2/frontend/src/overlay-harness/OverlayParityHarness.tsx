import type { CSSProperties } from "react";
import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import type { DesignSystemId } from "../overlay/core/profile-document";
import type {
  MockDataState,
  MockLocationScenario,
  MockSessionScenario,
} from "../overlay/core/mock-scenarios";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import { WidgetVisualHost } from "../overlay/core/WidgetVisualHost";

export type HarnessSurface = "studio" | "desktop" | "obs" | "harness";
export type HarnessWidget = "delta";
export type HarnessSystem = DesignSystemId;

export type HarnessQuery = {
  widget: HarnessWidget;
  system: HarnessSystem;
  session: MockSessionScenario;
  location: MockLocationScenario;
  state: MockDataState;
  surface: HarnessSurface;
};

const DEFAULT_QUERY: HarnessQuery = {
  widget: "delta",
  system: "vantare-original",
  session: "race",
  location: "track",
  state: "ready",
  surface: "harness",
};

const WIDGETS = new Set<HarnessWidget>(["delta"]);
const SYSTEMS = new Set<HarnessSystem>(["vantare-original", "vantare-crystal"]);
const SESSIONS = new Set<MockSessionScenario>(["practice", "qualifying", "race"]);
const LOCATIONS = new Set<MockLocationScenario>(["track", "pits"]);
const STATES = new Set<MockDataState>(["ready", "stale", "disconnected", "error"]);
const SURFACES = new Set<HarnessSurface>(["studio", "desktop", "obs", "harness"]);

export function parseHarnessQuery(search: string): HarnessQuery | { error: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const widget = (params.get("widget") ?? DEFAULT_QUERY.widget) as HarnessWidget;
  const system = (params.get("system") ?? DEFAULT_QUERY.system) as HarnessSystem;
  const session = (params.get("session") ?? DEFAULT_QUERY.session) as MockSessionScenario;
  const location = (params.get("location") ?? DEFAULT_QUERY.location) as MockLocationScenario;
  const state = (params.get("state") ?? DEFAULT_QUERY.state) as MockDataState;
  const surface = (params.get("surface") ?? DEFAULT_QUERY.surface) as HarnessSurface;

  if (!WIDGETS.has(widget)) {
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

  return { widget, system, session, location, state, surface };
}

export function OverlayParityHarness({ query }: { query: HarnessQuery }) {
  const snapshot = buildMockTelemetry({
    session: query.session,
    location: query.location,
    state: query.state,
  });
  const widget = deltaDefinition.createDefault("delta-harness");
  widget.visual = {
    ...widget.visual,
    systemId: query.system,
  };

  return (
    <div
      data-overlay-parity-stage
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
        <WidgetVisualHost widget={widget} snapshot={snapshot} renderMode={query.surface} />
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