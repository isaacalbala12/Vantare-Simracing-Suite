import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { DesktopOverlayRuntime } from "./DesktopOverlayRuntime";
import { ObsOverlayRuntime } from "./ObsOverlayRuntime";

const originalResizeObserver = globalThis.ResizeObserver;

function installViewportResizeObserver(width: number, height: number): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "desktop-runtime",
    name: "Desktop Runtime",
    displayMode: "racing",
    monitorIndex: 0,
    layoutViewport: { width: 1000, height: 1000 },
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
    installViewportResizeObserver(1600, 900);
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
    expect((view.getByTestId("runtime-overlay-scene") as HTMLElement).style.transform).toBe(
      "translate(0px, 0px) scale(0.9)",
    );
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    coordinator.dispose();
  });

  it("matches OBS scene and frame geometry for identical inputs", () => {
    installViewportResizeObserver(1600, 900);
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));
    const document = buildDocument();
    const layoutOrigin = { x: 20, y: 10 };

    const desktop = render(
      <DesktopOverlayRuntime
        document={document}
        revision="rev-parity"
        telemetry={coordinator}
        layoutOrigin={layoutOrigin}
      />,
    );
    const desktopSceneStyle = (desktop.getByTestId("runtime-overlay-scene") as HTMLElement).style.cssText;
    const desktopFrameStyle = (desktop.getByTestId("runtime-widget-frame") as HTMLElement).style.cssText;
    cleanup();

    const obs = render(
      <ObsOverlayRuntime
        document={document}
        revision="rev-parity"
        telemetry={coordinator}
        layoutOrigin={layoutOrigin}
      />,
    );
    expect((obs.getByTestId("runtime-overlay-scene") as HTMLElement).style.cssText).toBe(desktopSceneStyle);
    expect((obs.getByTestId("runtime-widget-frame") as HTMLElement).style.cssText).toBe(desktopFrameStyle);
    coordinator.dispose();
  });
});
