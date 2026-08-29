import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../core/mock-scenarios";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTelemetryRateCoordinator as createBaseTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import { createEngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import { buildEngineerPresentationFixture } from "../../engineer/engineer-presentation-fixtures";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

const originalResizeObserver = globalThis.ResizeObserver;

type ResizeObserverHarness = {
  trigger(width: number, height: number): void;
  disconnect: ReturnType<typeof vi.fn>;
};

let measuredWidth = 1920;
let measuredHeight = 1080;
let resizeObservers: ResizeObserverHarness[] = [];

function createTelemetryRateCoordinator() {
  const coordinator = createBaseTelemetryRateCoordinator();
  const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
  coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
  return coordinator;
}

function installResizeObserver(): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    private target: Element | null = null;
    readonly disconnect = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeObservers.push(this);
    }

    observe(target: Element): void {
      this.target = target;
      this.trigger(measuredWidth, measuredHeight);
    }

    unobserve(): void {}

    trigger(width: number, height: number): void {
      if (!this.target) return;
      this.callback(
        [{ target: this.target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  measuredWidth = 1920;
  measuredHeight = 1080;
  resizeObservers = [];
  installResizeObserver();
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

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
  it.each(["desktop", "obs"] as const)(
    "keeps the last %s layout mounted with visible diagnostics after a V2 failure",
    async (renderMode) => {
      const coordinator = createTelemetryRateCoordinator();
      const document = buildDocument();
      const visibleOnlyInRace = deltaDefinition.createDefault("race-diagnostic");
      visibleOnlyInRace.behavior.visibleWhen = { sessionTypes: ["race"] };
      document.layouts.general.widgets = [];
      document.layouts.race = { type: "race", widgets: [visibleOnlyInRace] };

      const view = render(
        <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode={renderMode} />,
      );
      expect(view.getByTestId("runtime-widget-frame").getAttribute("data-widget-id")).toBe("race-diagnostic");

      act(() => {
        coordinator.setOverlayFrame(undefined, { state: "error", reason: "invalid contract" });
        coordinator.setOverlayFailure({ code: "invalid-frame", message: "invalid contract" });
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

      expect(view.getByTestId("runtime-widget-frame").getAttribute("data-widget-id")).toBe("race-diagnostic");
      const alert = view.getByRole("alert");
      expect(alert.getAttribute("data-diagnostic-code")).toBe("overlay-v2-invalid-frame");
      coordinator.dispose();
    },
  );

  it("does not expose a logical scene before the real CSS viewport is positive", () => {
    measuredWidth = 0;
    measuredHeight = 0;
    const coordinator = createTelemetryRateCoordinator();

    const view = render(
      <RuntimeOverlaySurface document={buildDocument()} telemetry={coordinator} renderMode="desktop" />,
    );

    expect(view.queryByTestId("runtime-overlay-scene")).toBeNull();
    expect(view.queryAllByTestId("runtime-widget-frame")).toHaveLength(0);
    coordinator.dispose();
  });

  it.each([
    ["identity", { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 1, 0, 0, 1920, 1080],
    ["downscale", { width: 1920, height: 1080 }, { width: 960, height: 540 }, 0.5, 0, 0, 1920, 1080],
    ["upscale", { width: 1920, height: 1080 }, { width: 3840, height: 2160 }, 2, 0, 0, 1920, 1080],
    ["qhd 16:9", { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, 4 / 3, 0, 0, 1920, 1080],
    ["21:9 fill", { width: 1920, height: 1080 }, { width: 3440, height: 1440 }, 4 / 3, 40, 0, 2520, 1080],
    ["32:9 centered", { width: 1920, height: 1080 }, { width: 5120, height: 1440 }, 4 / 3, 880, 0, 2520, 1080],
    ["32:9 4k", { width: 1920, height: 1080 }, { width: 7680, height: 2160 }, 2, 1320, 0, 2520, 1080],
    ["custom mismatch", { width: 1000, height: 1000 }, { width: 1600, height: 900 }, 0.9, 0, 0, 1600 / 0.9, 1000],
  ])(
    "applies one shared responsive transform for %s output",
    (_label, layoutViewport, outputViewport, scale, offsetX, offsetY, layoutWidth, layoutHeight) => {
      measuredWidth = outputViewport.width;
      measuredHeight = outputViewport.height;
      const coordinator = createTelemetryRateCoordinator();
      const document = buildDocument();
      document.layoutViewport = layoutViewport;

      const view = render(
        <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="desktop" />,
      );

      const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
      expect(Number(scene.dataset.layoutWidth)).toBeCloseTo(layoutWidth);
      expect(Number(scene.dataset.layoutHeight)).toBeCloseTo(layoutHeight);
      expect(Number(scene.dataset.scale)).toBeCloseTo(scale);
      expect(Number(scene.dataset.offsetX)).toBeCloseTo(offsetX);
      expect(Number(scene.dataset.offsetY)).toBeCloseTo(offsetY);
      expect(scene.style.transform).toBe(
        `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
      );
      for (const frame of view.getAllByTestId("runtime-widget-frame")) {
        expect((frame as HTMLElement).style.transform).toBe("");
      }
      coordinator.dispose();
    },
  );

  it("uses the legacy 1920x1080 layout when layoutViewport is absent", () => {
    measuredWidth = 960;
    measuredHeight = 540;
    const coordinator = createTelemetryRateCoordinator();

    const view = render(
      <RuntimeOverlaySurface document={buildDocument()} telemetry={coordinator} renderMode="obs" />,
    );

    const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
    expect(scene.style.width).toBe("1920px");
    expect(scene.style.height).toBe("1080px");
    expect(scene.dataset.scale).toBe("0.5");
    coordinator.dispose();
  });

  it("subtracts layoutOrigin once in logical space before the shared scale", () => {
    measuredWidth = 960;
    measuredHeight = 540;
    const coordinator = createTelemetryRateCoordinator();
    const document = buildDocument();
    const widget = document.layouts.general.widgets[0];
    widget.layout = { ...widget.layout, x: 120, y: 80 };
    document.layouts.general.widgets = [widget];

    const view = render(
      <RuntimeOverlaySurface
        document={document}
        telemetry={coordinator}
        renderMode="desktop"
        layoutOrigin={{ x: 20, y: 10 }}
      />,
    );

    const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
    const frame = view.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(scene.dataset.scale).toBe("0.5");
    expect(frame.style.left).toBe("100px");
    expect(frame.style.top).toBe("70px");
    expect(frame.style.transform).toBe("");
    coordinator.dispose();
  });

  it("updates from ResizeObserver and disconnects it without installing a transformed-window fallback", () => {
    const coordinator = createTelemetryRateCoordinator();
    const transformedRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 960,
      bottom: 540,
      left: 0,
      width: 960,
      height: 540,
      toJSON: () => ({}),
    });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = render(
      <RuntimeOverlaySurface document={buildDocument()} telemetry={coordinator} renderMode="desktop" />,
    );
    const observer = resizeObservers[0];

    expect((view.getByTestId("runtime-overlay-scene") as HTMLElement).dataset.scale).toBe("1");
    expect(transformedRect).not.toHaveBeenCalled();
    act(() => observer.trigger(960, 540));
    expect((view.getByTestId("runtime-overlay-scene") as HTMLElement).dataset.scale).toBe("0.5");

    view.unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(0);
    expect(removeEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(0);
    transformedRect.mockRestore();
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
    coordinator.dispose();
  });

  it("falls back to the untransformed client box and cleans up its resize listener when ResizeObserver is unavailable", () => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(900);
    const transformedRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 450,
      left: 0,
      width: 800,
      height: 450,
      toJSON: () => ({}),
    });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const coordinator = createTelemetryRateCoordinator();
    const document = buildDocument();
    document.layoutViewport = { width: 1000, height: 1000 };

    const view = render(
      <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="obs" />,
    );

    const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
    expect(scene.style.transform).toBe("translate(0px, 0px) scale(0.9)");
    act(() => window.dispatchEvent(new Event("resize")));
    expect(scene.style.transform).toBe("translate(0px, 0px) scale(0.9)");
    expect(transformedRect).not.toHaveBeenCalled();
    expect(addEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);

    view.unmount();
    expect(removeEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);
    clientWidth.mockRestore();
    clientHeight.mockRestore();
    transformedRect.mockRestore();
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
    coordinator.dispose();
  });

  it("clips partially out-of-layout widgets at the logical scene without filling transparent bands", () => {
    measuredWidth = 1600;
    measuredHeight = 900;
    const coordinator = createTelemetryRateCoordinator();
    const document = buildDocument();
    document.layoutViewport = { width: 1000, height: 1000 };
    const widget = document.layouts.general.widgets[0];
    widget.layout = { ...widget.layout, x: -100, y: 80, w: 200 };
    document.layouts.general.widgets = [widget];

    const view = render(
      <RuntimeOverlaySurface document={document} telemetry={coordinator} renderMode="desktop" />,
    );

    const surface = view.getByTestId("runtime-overlay-surface") as HTMLElement;
    const scene = view.getByTestId("runtime-overlay-scene") as HTMLElement;
    const frame = view.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(surface.style.overflow).toBe("hidden");
    expect(surface.style.background).toBe("transparent");
    expect(scene.style.overflow).toBe("hidden");
    expect(scene.dataset.offsetX).toBe("0");
    expect(frame.style.left).toBe("-177.777778px");
    expect(frame.style.width).toBe("200px");
    coordinator.dispose();
  });

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

  it("renders optional subtitles independently from the radio widget", () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));
    const document = buildDocument();
    document.layouts.general.widgets = [];
    const presentations = createEngineerPresentationStore({ now: () => 1_000 });
    presentations.publish(buildEngineerPresentationFixture("en", "warning"));

    const view = render(
      <RuntimeOverlaySurface
        document={document}
        telemetry={coordinator}
        renderMode="desktop"
        engineerPresentations={presentations}
      />,
    );
    const scene = view.getByTestId("runtime-overlay-scene");
    const subtitles = view.container.querySelector("[data-engineer-subtitles]");
    expect(subtitles).toBeTruthy();
    expect(scene.contains(subtitles)).toBe(true);
    expect(view.container.querySelector("[data-engineer-radio-root]")).toBeNull();
    coordinator.dispose();
    presentations.dispose();
  });
});
