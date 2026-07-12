import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";

afterEach(() => cleanup());

function buildDocument(): ProfileDocumentV3 {
  const back = standingsDefinition.createDefault("standings-back");
  back.layout.zIndex = 1;
  const front = deltaDefinition.createDefault("delta-front");
  front.layout.zIndex = 4;
  const hidden = deltaDefinition.createDefault("delta-hidden");
  hidden.behavior.enabled = false;
  hidden.layout.zIndex = 9;

  return {
    schemaVersion: 3,
    id: "surface-profile",
    name: "Surface Profile",
    displayMode: "racing",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [back, front, hidden],
        preservedWidgets: [{ id: "legacy-telemetry", type: "telemetry", source: { id: "legacy-telemetry" } }],
      },
    },
  };
}

describe("RuntimeOverlaySurface", () => {
  it("renders a transparent empty surface when no widgets are visible", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const document = buildDocument();
    document.layouts.general.widgets = [];

    const view = render(
      <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="desktop" />,
    );
    const surface = view.getByTestId("runtime-overlay-surface") as HTMLElement;
    expect(surface.style.background).toBe("transparent");
    expect(view.queryAllByTestId("runtime-widget-frame")).toHaveLength(0);
    coordinator.dispose();
  });

  it("renders enabled visible widgets sorted by z-index without studio chrome", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

    const view = render(
      <RuntimeOverlaySurface document={buildDocument()} telemetry={coordinator} renderMode="desktop" />,
    );

    const frames = view.getAllByTestId("runtime-widget-frame");
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.getAttribute("data-widget-id"))).toEqual([
      "standings-back",
      "delta-front",
    ]);
    expect(view.container.querySelector("[data-studio-frame-selected]")).toBeNull();
    expect(view.container.querySelector("[data-resize-handle]")).toBeNull();
    coordinator.dispose();
  });

  it("renders the same widget roots for desktop and obs", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));
    const document = buildDocument();

    const desktop = render(
      <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="desktop" />,
    );
    const desktopRenderer = desktop.container.querySelector('[data-widget-renderer="delta"]');
    cleanup();

    const obs = render(
      <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="obs" />,
    );
    const obsRenderer = obs.container.querySelector('[data-widget-renderer="delta"]');
    expect(desktopRenderer).toBeTruthy();
    expect(obsRenderer).toBeTruthy();
    coordinator.dispose();
  });

  it("emits one preserved-widget diagnostic and keeps siblings when one renderer fails", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));
    const onDiagnostic = vi.fn();

    const document = buildDocument();
    document.layouts.general.widgets[1].content = { invalid: true };

    const view = render(
      <RuntimeOverlaySurface
        document={document}
        telemetry={coordinator}
        renderMode="obs"
        onDiagnostic={onDiagnostic}
      />,
    );

    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "preserved-widgets-skipped", surface: "obs" }),
    );
    expect(view.getAllByTestId("widget-host-diagnostic")).toHaveLength(1);
    expect(view.container.querySelector('[data-widget-renderer="standings"]')).toBeTruthy();
    coordinator.dispose();
  });

  it("keeps surface diagnostics bounded and separate from the callback", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));
    const diagnostics = createWidgetDiagnosticCollector(2);
    const onDiagnostic = vi.fn();

    render(
      <RuntimeOverlaySurface
        document={buildDocument()}
        telemetry={coordinator}
        renderMode="obs"
        diagnostics={diagnostics}
        onDiagnostic={onDiagnostic}
      />,
    );

    expect(diagnostics.counts()).toEqual({ "preserved-widgets-skipped": 1 });
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(diagnostics.list())).not.toMatch(/profile|telemetry|driver/i);
    coordinator.dispose();
  });
});
