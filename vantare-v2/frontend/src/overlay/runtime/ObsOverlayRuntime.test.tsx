import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTestTelemetryCoordinator } from "../../hub/overlay-studio/test-helpers";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
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
    id: "obs-runtime",
    name: "OBS Runtime",
    displayMode: "streaming",
    monitorIndex: 0,
    layoutViewport: { width: 3440, height: 1440 },
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
    installViewportResizeObserver(1920, 1080);
    const coordinator = createTestTelemetryCoordinator();

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
    const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
    expect(Number(scene.dataset.scale)).toBeCloseTo(1080 / 1440);
    expect(Number(scene.dataset.offsetX)).toBe(0);
    expect(Number(scene.dataset.offsetY)).toBe(0);
    expect(view.getByTestId("runtime-widget-frame")).toBeTruthy();
    coordinator.dispose();
  });
});
