import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { ObsOverlayRuntime } from "./ObsOverlayRuntime";

afterEach(() => cleanup());

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "obs-runtime",
    name: "OBS Runtime",
    displayMode: "streaming",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [standingsDefinition.createDefault("standings-main")],
      },
    },
  };
}

describe("ObsOverlayRuntime", () => {
  it("renders the shared runtime surface in obs mode", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const view = render(
      <ObsOverlayRuntime
        document={buildDocument()}
        revision="rev-1"
        telemetry={coordinator}
        layoutOrigin={{ x: 0, y: 0 }}
      />,
    );

    const surface = view.getByTestId("runtime-overlay-surface");
    expect(surface.getAttribute("data-render-mode")).toBe("obs");
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    coordinator.dispose();
  });
});