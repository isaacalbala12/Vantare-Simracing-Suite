import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { DesktopOverlayRuntime } from "./DesktopOverlayRuntime";

afterEach(() => cleanup());

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "desktop-runtime",
    name: "Desktop Runtime",
    displayMode: "racing",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

describe("DesktopOverlayRuntime", () => {
  it("renders the shared runtime surface in desktop mode", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const view = render(
      <DesktopOverlayRuntime
        document={buildDocument()}
        revision="rev-1"
        telemetry={coordinator}
        layoutOrigin={{ x: 0, y: 0 }}
      />,
    );

    const surface = view.getByTestId("runtime-overlay-surface");
    expect(surface.getAttribute("data-render-mode")).toBe("desktop");
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    coordinator.dispose();
  });
});