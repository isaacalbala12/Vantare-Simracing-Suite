/**
 * Widget parity visual harness — renders each official design's widget
 * in isolation for Playwright measurement and screenshot capture.
 *
 * This bypasses HubApp/Wails entirely. Each design is rendered in its
 * own React root with canonical preview fixtures injected.
 */
/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { StandingsWidget } from "./overlay/widgets/StandingsWidget";
import { RelativeWidget } from "./overlay/widgets/RelativeWidget";
import { DeltaWidget } from "./overlay/widgets/DeltaWidget";
import { PedalsWidget } from "./overlay/widgets/PedalsWidget";
import {
  applyOfficialDesignToProfile,
  getOfficialDesign,
  OFFICIAL_DESIGNS,
} from "./hub/widgets/widget-design-gallery";
import { enrichWidgetPropsWithVariant } from "./lib/widget-variants";
import {
  applyCanonicalPreviewOverrides,
  getCanonicalPreviewMaxRows,
  getCanonicalPreviewTelemetry,
} from "./overlay/widgets/widget-preview-fixtures";
import { getWidgetPreviewContractSize } from "./overlay-harness/widget-preview-contract";
import type { ProfileConfig } from "./lib/profile";

// ── Canonical profile ─────────────────────────────────────────────────────────

const CANONICAL_PROFILE: ProfileConfig = {
  id: "parity-harness",
  name: "Parity Harness",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: OFFICIAL_DESIGNS.map((d) => ({
    id: `widget-${d.id}`,
    type: d.widgetType,
    enabled: true,
    position: { x: 0, y: 0, w: 400, h: 400 },
    props: {},
  })),
  variants: [],
};

function buildProfileWithDesigns(): ProfileConfig {
  let profile = CANONICAL_PROFILE;
  for (const design of OFFICIAL_DESIGNS) {
    const widget = profile.widgets.find((w) => w.id === `widget-${design.id}`);
    if (widget) {
      profile = applyOfficialDesignToProfile(profile, widget.id, design);
    }
  }
  return profile;
}

const PROFILE = buildProfileWithDesigns();

// ── Widget map ────────────────────────────────────────────────────────────────

type WidgetComp = React.ComponentType<{ editMode: boolean; telemetryMode: string; props?: Record<string, unknown> }>;

const WIDGET_MAP: Record<string, WidgetComp> = {
  standings: StandingsWidget as WidgetComp,
  relative: RelativeWidget as WidgetComp,
  delta: DeltaWidget as WidgetComp,
  pedals: PedalsWidget as WidgetComp,
};


// ── Design renderer ───────────────────────────────────────────────────────────

function DesignBlock({ designId }: { designId: string }) {
  const design = getOfficialDesign(designId);
  if (!design) return <div>Design not found: {designId}</div>;

  const widget = PROFILE.widgets.find((w) => w.id === `widget-${design.id}`);
  if (!widget) return <div>Widget not found for type: {design.widgetType}</div>;

  const Component = WIDGET_MAP[design.widgetType];
  if (!Component) return <div>No component for: {design.widgetType}</div>;

  // Apply the same canonical override path that WidgetSandboxPreview uses.
  const overriddenProfile = applyCanonicalPreviewOverrides(PROFILE, widget);
  const enriched = enrichWidgetPropsWithVariant(overriddenProfile, widget);
  const contractSize = getWidgetPreviewContractSize(design.widgetType);
  const canonicalMaxRows = getCanonicalPreviewMaxRows(design.widgetType);

  // Pass the full enriched object (includes variant with canonical columns/filters).
  // Also set maxRows from canonical fixtures for standings (same as WidgetSandboxPreview).
  const componentProps: Record<string, unknown> = {
    ...enriched,
    __previewTelemetry: getCanonicalPreviewTelemetry(),
    ...(canonicalMaxRows != null ? { maxRows: canonicalMaxRows } : {}),
  };

  return (
    <div data-design-id={designId} data-widget-type={design.widgetType} className="inline-block" style={{ width: contractSize.width, height: contractSize.height }}>
      <Component
        editMode
        telemetryMode="mock"
        props={componentProps}
      />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const params = new URLSearchParams(window.location.search);
  const designId = params.get("design");
  const mode = params.get("mode");

  if (mode === "all") {
    return (
      <div className="p-4 bg-black min-h-screen">
        {OFFICIAL_DESIGNS.map((d) => (
          <div key={d.id} className="mb-8">
            <h2 className="text-white text-sm mb-2 font-mono">{d.id}</h2>
            <DesignBlock designId={d.id} />
          </div>
        ))}
      </div>
    );
  }

  if (designId) {
    return (
      <div className="p-4 bg-black min-h-screen flex items-start justify-center">
        <DesignBlock designId={designId} />
      </div>
    );
  }

  return (
    <div className="p-8 bg-black text-white min-h-screen">
      <h1 className="text-xl font-bold mb-4">Widget Parity Harness</h1>
      <p className="mb-2">Add <code>?design=standings-leaderboard</code> to render a single design.</p>
      <p className="mb-2">Add <code>?mode=all</code> to render all designs.</p>
      <ul className="list-disc list-inside text-sm text-gray-400">
        {OFFICIAL_DESIGNS.map((d) => (
          <li key={d.id}><a href={`?design=${d.id}`} className="underline">{d.id}</a></li>
        ))}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
