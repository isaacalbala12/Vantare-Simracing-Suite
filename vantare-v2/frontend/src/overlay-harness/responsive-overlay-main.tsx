import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { buildHarnessTelemetry, buildHarnessWidget } from "../overlay/authoring/fixtures/authoring-fixtures";
import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "../overlay/runtime/RuntimeOverlaySurface";

function buildResponsiveDocument(): ProfileDocumentV3 {
  const tower = buildHarnessWidget("broadcast-tower", "vantare-original");
  tower.layout = { ...tower.layout, x: 0, y: 0, w: 1920, h: 71, zIndex: 1 };
  const standings = buildHarnessWidget("standings", "vantare-crystal", "standings-multiclass");
  standings.layout = { ...standings.layout, x: 1500, y: 90, zIndex: 2 };
  const delta = buildHarnessWidget("delta", "vantare-crystal");
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
coordinator.publish(
  buildHarnessTelemetry({ session: "race", location: "track", state: "ready", widget: "delta" }),
);

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
