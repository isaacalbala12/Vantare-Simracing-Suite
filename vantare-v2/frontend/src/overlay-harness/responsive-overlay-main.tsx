import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { buildAuthoringV2ScenarioRuntime } from "../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";
import { widgetTypeRegistry } from "../overlay/core/widget-registry";
import { RuntimeOverlaySurface } from "../overlay/runtime/RuntimeOverlaySurface";

export function buildResponsiveDocument(): ProfileDocumentV3 {
  const tower = widgetTypeRegistry.get("broadcast-tower").createDefault("broadcast-tower-harness");
  tower.visual = { ...tower.visual, systemId: "vantare-original" };
  tower.content = { ...tower.content, rowCount: 10 };
  tower.layout = { ...tower.layout, x: 0, y: 0, w: 1920, h: 71, zIndex: 1 };

  const standings = widgetTypeRegistry.get("standings").createDefault("standings-harness");
  standings.visual = { ...standings.visual, systemId: "vantare-crystal" };
  const columns = Array.isArray(standings.content.columns)
    ? standings.content.columns.map((column) =>
        column.metricId === "bestLap" ? { ...column, enabled: true } : column,
      )
    : standings.content.columns;
  standings.content = { ...standings.content, classScope: "all-classes", columns };
  standings.layout = { ...standings.layout, x: 1500, y: 90, zIndex: 2 };

  const delta = widgetTypeRegistry.get("delta").createDefault("delta-harness");
  delta.visual = { ...delta.visual, systemId: "vantare-crystal" };
  delta.layout = { ...delta.layout, x: 120, y: 940, zIndex: 3 };

  return {
    schemaVersion: 3,
    id: "responsive-harness",
    name: "Responsive Harness",
    displayMode: "racing",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [tower, standings, delta],
      },
    },
  };
}

const coordinator = createTelemetryRateCoordinator();
const runtime = buildAuthoringV2ScenarioRuntime({
  session: "race",
  location: "track",
  state: "ready",
  widget: "standings",
  system: "vantare-crystal",
  variant: "standings-multiclass",
});
coordinator.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="preview-grid-bg" style={{ width: "100vw", height: "100vh" }}>
      <RuntimeOverlaySurface
        document={buildResponsiveDocument()}
        telemetry={coordinator}
        renderMode="obs"
      />
    </div>
  </StrictMode>,
);
