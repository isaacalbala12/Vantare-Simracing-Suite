import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { buildMockTelemetry } from "../overlay/core/mock-scenarios";
import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { createTelemetryRateCoordinator } from "../overlay/core/telemetry-rate-coordinator";
import { RuntimeOverlaySurface } from "../overlay/runtime/RuntimeOverlaySurface";
import { broadcastTowerDefinition } from "../overlay/widget-types/broadcast-tower/broadcast-tower-definition";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import { standingsDefinition } from "../overlay/widget-types/standings/standings-definition";

function buildResponsiveDocument(): ProfileDocumentV3 {
  const tower = broadcastTowerDefinition.createDefault("tower-full");
  tower.layout.zIndex = 1;
  const standings = standingsDefinition.createDefault("standings-right");
  standings.layout.zIndex = 2;
  standings.layout = { ...standings.layout, x: 1500, y: 60 };
  const delta = deltaDefinition.createDefault("delta-left");
  delta.layout.zIndex = 3;
  delta.layout = { ...delta.layout, x: 120, y: 900 };

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
coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RuntimeOverlaySurface
      document={buildResponsiveDocument()}
      telemetry={coordinator}
      renderMode="obs"
    />
  </StrictMode>,
);
