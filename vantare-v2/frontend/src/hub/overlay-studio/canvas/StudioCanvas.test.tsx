import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import {
  resolveLayoutViewport,
  type LayoutViewport,
} from "../../../overlay/core/layout-viewport";
import { createTestTelemetryCoordinator } from "../test-helpers";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { pedalsDefinition } from "../../../overlay/widget-types/pedals/pedals-definition";
import { StudioProvider, useStudioDocument, useStudioPreview } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { SAFE_AREA_INSET_RATIO } from "./canvas-backgrounds";
import { StudioCanvas } from "./StudioCanvas";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { StudioMonitor } from "../state/studio-monitor-client";

const originalResizeObserver = globalThis.ResizeObserver;

function installViewportResizeObserver(width: number, height: number): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(element: Element): void {
      Object.defineProperty(element, "clientWidth", {
        configurable: true,
        value: width,
      });
      Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: height,
      });
      this.callback([], this as unknown as ResizeObserver);
    }

    disconnect(): void {
      return undefined;
    }

    unobserve(): void {
      return undefined;
    }
  } as unknown as typeof ResizeObserver;
}

function buildDocument(layoutViewport?: LayoutViewport): ProfileDocumentV3 {
  const back = deltaDefinition.createDefault("delta-back");
  back.layout = { ...back.layout, x: 40, y: 40, zIndex: 0 };
  const front = pedalsDefinition.createDefault("delta-front");
  front.layout = { ...front.layout, x: 200, y: 120, zIndex: 2 };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    ...(layoutViewport ? { layoutViewport } : {}),
    layouts: {
      general: {
        type: "general",
        widgets: [front, back],
      },
    },
  };
}

function createClient(document = buildDocument()): StudioProfileClient {
  return {
    load: async () => ({ document: structuredClone(document), revision: "rev-1" }),
    save: async ({ document: saved }) => ({
      status: "saved",
      document: structuredClone(saved),
      revision: "rev-2",
    }),
  };
}

const client = createClient();

function renderCanvas(
  zoom: "fit" | 50 | 75 | 100 | 125 = "fit",
  document = buildDocument(),
  listMonitors: () => Promise<StudioMonitor[]> = async () => [],
) {
  const coordinator = createTestTelemetryCoordinator();

  function ZoomSetter(): React.ReactElement | null {
    const { setPreview } = useStudioPreview();
    if (zoom === "fit") {
      return null;
    }
    return (
      <button
        type="button"
        data-testid="set-preview"
        onClick={() => setPreview({ zoom })}
      />
    );
  }

  return render(
    <div style={{ width: 960, height: 540 }}>
      <StudioProvider client={createClient(document)} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <ZoomSetter />
          <StudioCanvas listMonitors={listMonitors} />
        </StudioTelemetryProvider>
      </StudioProvider>
    </div>,
  );
}

describe("StudioCanvas", () => {
  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("scales the 1920x1080 logical scene into the viewport", async () => {
    installViewportResizeObserver(960, 540);
    renderCanvas("fit");
    await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

    const scene = screen.getByTestId("studio-canvas-scene");
    expect(scene.style.width).toBe("1920px");
    expect(scene.style.height).toBe("1080px");
    expect(scene.getAttribute("data-scale")).toBe("0.5");
    expect(scene.style.transform).toBe("scale(0.5)");
  });

  it("renders and fits a 3440x1440 document surface", async () => {
    installViewportResizeObserver(960, 540);
    renderCanvas("fit", buildDocument({ width: 3440, height: 1440 }));
    await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

    const scene = screen.getByTestId("studio-canvas-scene");
    expect(scene.style.width).toBe("3440px");
    expect(scene.style.height).toBe("1440px");
    expect(scene.getAttribute("data-layout-viewport")).toBe("3440x1440");
    expect(scene.hasAttribute("data-preview-resolution")).toBe(false);
    expect(Number(scene.getAttribute("data-scale"))).toBeCloseTo(960 / 3440, 5);
  });

  it("dispatches preset and custom surface edits through the document command", async () => {
    installViewportResizeObserver(960, 540);
    renderCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

    fireEvent.change(screen.getByTestId("studio-resolution-select"), {
      target: { value: "5120x1440" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-canvas-scene").style.width).toBe("5120px");
      expect(screen.getByTestId("studio-canvas-scene").style.height).toBe("1440px");
    });

    fireEvent.change(screen.getByTestId("studio-layout-width-input"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByTestId("studio-layout-height-input"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByTestId("studio-layout-viewport-apply"));
    await waitFor(() => {
      expect(screen.getByTestId("studio-canvas-scene").style.width).toBe("1000px");
      expect(screen.getByTestId("studio-canvas-scene").style.height).toBe("1000px");
      expect(Number(screen.getByTestId("studio-canvas-scene").getAttribute("data-scale"))).toBeCloseTo(0.54, 5);
    });
  });

  it("enumerates native monitors without replacing or dirtying a custom surface", async () => {
    installViewportResizeObserver(960, 540);
    const listMonitors = vi.fn(async (): Promise<StudioMonitor[]> => [
      {
        index: 0,
        id: "display-0",
        name: "Primary",
        isPrimary: true,
        scaleFactor: 1.5,
        bounds: { width: 2560, height: 1440 },
        workArea: { width: 2560, height: 1392 },
      },
    ]);

    function Probe(): React.ReactElement {
      const { document, dirty } = useStudioDocument();
      const viewport = resolveLayoutViewport(document ?? {});
      return (
        <div data-testid="monitor-document-probe">
          {document?.monitorIndex}:{viewport.width}x{viewport.height}:{dirty ? "dirty" : "clean"}
        </div>
      );
    }

    render(
      <StudioProvider
        client={createClient(buildDocument({ width: 1000, height: 1000 }))}
        initialFile="profiles/a.json"
      >
        <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
          <Probe />
          <StudioCanvas listMonitors={listMonitors} />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    await waitFor(() => expect(listMonitors).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("monitor-document-probe").textContent).toBe(
        "0:1000x1000:clean",
      ),
    );
  });

  it("ignores a stale monitor enumeration after its effect is cancelled", async () => {
    installViewportResizeObserver(960, 540);
    let resolveFirst: ((monitors: StudioMonitor[]) => void) | undefined;
    const first = () => new Promise<StudioMonitor[]>((resolve) => {
      resolveFirst = resolve;
    });
    const currentMonitor: StudioMonitor = {
      index: 0,
      id: "current",
      name: "Current",
      isPrimary: true,
      scaleFactor: 1,
      bounds: { width: 1920, height: 1080 },
      workArea: { width: 1920, height: 1040 },
    };
    const staleMonitor: StudioMonitor = {
      ...currentMonitor,
      index: 7,
      id: "stale",
      name: "Stale",
    };
    const coordinator = createTestTelemetryCoordinator();
    const tree = (listMonitors: () => Promise<StudioMonitor[]>) => (
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
          <StudioCanvas listMonitors={listMonitors} />
        </StudioTelemetryProvider>
      </StudioProvider>
    );
    const view = render(tree(first));
    await waitFor(() => expect(resolveFirst).toBeTypeOf("function"));

    view.rerender(tree(async () => [currentMonitor]));
    await waitFor(() =>
      expect(screen.getByTestId("studio-monitor-select").textContent).toContain("Current"),
    );
    resolveFirst?.([staleMonitor]);

    await Promise.resolve();
    expect(screen.getByTestId("studio-monitor-select").textContent).not.toContain("Stale");
  });

  it("selects full monitor bounds as one undoable and redoable document change", async () => {
    installViewportResizeObserver(960, 540);
    const monitors: StudioMonitor[] = [
      {
        index: 0,
        id: "display-0",
        name: "Primary",
        isPrimary: true,
        scaleFactor: 1,
        bounds: { width: 1920, height: 1080 },
        workArea: { width: 1920, height: 1040 },
      },
      {
        index: 2,
        id: "display-2",
        name: "Ultra wide",
        isPrimary: false,
        scaleFactor: 1.5,
        bounds: { width: 3440, height: 1440 },
        workArea: { width: 3440, height: 1392 },
      },
    ];

    function Probe(): React.ReactElement {
      const { document, dirty, undo, redo } = useStudioDocument();
      const viewport = resolveLayoutViewport(document ?? {});
      return (
        <>
          <div data-testid="monitor-document-probe">
            {document?.monitorIndex}:{viewport.width}x{viewport.height}:{dirty ? "dirty" : "clean"}
          </div>
          <button type="button" data-testid="monitor-undo" onClick={undo} />
          <button type="button" data-testid="monitor-redo" onClick={redo} />
        </>
      );
    }

    render(
      <StudioProvider client={createClient()} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
          <Probe />
          <StudioCanvas listMonitors={async () => monitors} />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-monitor-select")).toBeTruthy());
    fireEvent.change(screen.getByTestId("studio-monitor-select"), { target: { value: "2" } });
    await waitFor(() =>
      expect(screen.getByTestId("monitor-document-probe").textContent).toBe(
        "2:3440x1440:dirty",
      ),
    );

    fireEvent.click(screen.getByTestId("monitor-undo"));
    expect(screen.getByTestId("monitor-document-probe").textContent).toBe("0:1920x1080:clean");
    fireEvent.click(screen.getByTestId("monitor-redo"));
    expect(screen.getByTestId("monitor-document-probe").textContent).toBe("2:3440x1440:dirty");
  });

  it.each([
    ["empty", async (): Promise<StudioMonitor[]> => []],
    ["error", async (): Promise<StudioMonitor[]> => Promise.reject(new Error("unavailable"))],
  ])("keeps custom dimensions active when monitor enumeration is %s", async (_case, listMonitors) => {
    installViewportResizeObserver(960, 540);
    renderCanvas("fit", buildDocument({ width: 1000, height: 1000 }), listMonitors);

    await waitFor(() =>
      expect((screen.getByTestId("studio-monitor-select") as HTMLSelectElement).disabled).toBe(true),
    );
    expect(screen.getByTestId("studio-canvas-scene").getAttribute("data-layout-viewport")).toBe(
      "1000x1000",
    );
    expect((screen.getByTestId("studio-resolution-select") as HTMLSelectElement).disabled).toBe(
      false,
    );
  });

  it("keeps the unavailable document monitor selected after hotplug", async () => {
    installViewportResizeObserver(960, 540);
    const document = buildDocument({ width: 1000, height: 1000 });
    document.monitorIndex = 9;
    renderCanvas("fit", document, async () => [
      {
        index: 0,
        id: "display-0",
        name: "Primary",
        isPrimary: true,
        scaleFactor: 1,
        bounds: { width: 1920, height: 1080 },
        workArea: { width: 1920, height: 1040 },
      },
    ]);

    await waitFor(() =>
      expect((screen.getByTestId("studio-monitor-select") as HTMLSelectElement).value).toBe(
        "unavailable:9",
      ),
    );
    expect(screen.getByTestId("studio-canvas-scene").getAttribute("data-layout-viewport")).toBe(
      "1000x1000",
    );
  });

  it("resynchronizes monitor and surface after recoverability rejects a selection", async () => {
    installViewportResizeObserver(960, 540);
    const document = buildDocument({ width: 3440, height: 1440 });
    document.monitorIndex = 1;
    document.layouts.general.widgets[0]!.layout.x = 3200;

    function Probe(): React.ReactElement {
      const { document, dirty, accessNotice } = useStudioDocument();
      const viewport = resolveLayoutViewport(document ?? {});
      return (
        <div data-testid="monitor-document-probe">
          {document?.monitorIndex}:{viewport.width}x{viewport.height}:{dirty ? "dirty" : "clean"}:
          {accessNotice ?? ""}
        </div>
      );
    }

    const monitors: StudioMonitor[] = [
      {
        index: 0,
        id: "display-0",
        name: "Small",
        isPrimary: true,
        scaleFactor: 1,
        bounds: { width: 1920, height: 1080 },
        workArea: { width: 1920, height: 1040 },
      },
      {
        index: 1,
        id: "display-1",
        name: "Wide",
        isPrimary: false,
        scaleFactor: 1,
        bounds: { width: 3440, height: 1440 },
        workArea: { width: 3440, height: 1392 },
      },
    ];
    render(
      <StudioProvider client={createClient(document)} initialFile="profiles/a.json">
        <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
          <Probe />
          <StudioCanvas listMonitors={async () => monitors} />
        </StudioTelemetryProvider>
      </StudioProvider>,
    );

    await waitFor(() =>
      expect((screen.getByTestId("studio-monitor-select") as HTMLSelectElement).disabled).toBe(false),
    );
    fireEvent.change(screen.getByTestId("studio-monitor-select"), { target: { value: "0" } });
    await waitFor(() =>
      expect(screen.getByTestId("monitor-document-probe").textContent).toContain("recoverable"),
    );
    expect((screen.getByTestId("studio-monitor-select") as HTMLSelectElement).value).toBe("1");
    expect(screen.getByTestId("studio-canvas-scene").getAttribute("data-layout-viewport")).toBe(
      "3440x1440",
    );
    expect(screen.getByTestId("monitor-document-probe").textContent).toContain(
      "1:3440x1440:clean",
    );
  });

  it("renders widgets in ascending z-index order", async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-back")).toBeTruthy());

    const frames = screen.getAllByTestId(/^studio-widget-frame-/);
    expect(frames.map((frame) => frame.getAttribute("data-testid"))).toEqual([
      "studio-widget-frame-delta-back",
      "studio-widget-frame-delta-front",
    ]);
    expect(screen.getByTestId("studio-widget-frame-delta-back").style.zIndex).toBe("0");
    expect(screen.getByTestId("studio-widget-frame-delta-front").style.zIndex).toBe("2");
  });

  it("runs canvas action bar commands without clearing selection on pointer-down", async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-back")).toBeTruthy());

    fireEvent.pointerDown(screen.getByTestId("studio-widget-frame-delta-front"), {
      pointerId: 1,
      button: 0,
      clientX: 80,
      clientY: 80,
      bubbles: true,
    });
    await waitFor(() => expect(screen.getByTestId("studio-canvas-action-bar")).toBeTruthy());

    fireEvent.click(screen.getByTestId("studio-action-duplicate"));

    await waitFor(() =>
      expect(screen.getByTestId("studio-widget-frame-delta-front-copy")).toBeTruthy(),
    );
    expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-selected-widget-id")).toBe(
      "delta-front-copy",
    );
  });

  it("keeps canvas scale stable when selecting a widget", async () => {
    installViewportResizeObserver(960, 420);

    function SelectionProbe(): React.ReactElement {
      const { selectWidget } = useStudioDocument();
      return (
        <button
          type="button"
          data-testid="select-back"
          onClick={() => selectWidget("delta-back")}
        />
      );
    }

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
            <SelectionProbe />
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

    const scaleBefore = screen.getByTestId("studio-canvas-scene").getAttribute("data-scale");
    expect(screen.getByTestId("studio-canvas-action-bar-slot")).toBeTruthy();
    expect(screen.getByTestId("studio-canvas-action-bar-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("studio-canvas-action-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("select-back"));
    await waitFor(() => expect(screen.getByTestId("studio-canvas-action-bar")).toBeTruthy());

    expect(screen.getByTestId("studio-canvas-scene").getAttribute("data-scale")).toBe(scaleBefore);
  });

  it("clears selection when clicking the empty canvas viewport", async () => {
    function SelectionProbe(): React.ReactElement {
      const { selectedWidgetId, selectWidget } = useStudioDocument();
      return (
        <>
          <button type="button" data-testid="select-front" onClick={() => selectWidget("delta-front")} />
          <div data-testid="selected-id">{selectedWidgetId ?? ""}</div>
        </>
      );
    }

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
            <SelectionProbe />
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("select-front")).toBeTruthy());
    fireEvent.click(screen.getByTestId("select-front"));
    expect(screen.getByTestId("selected-id").textContent).toBe("delta-front");

    fireEvent.pointerDown(screen.getByTestId("studio-canvas-viewport"));
    expect(screen.getByTestId("selected-id").textContent).toBe("");
  });

  it("feeds widgets telemetry from the shared provider snapshot", async () => {
    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-back")).toBeTruthy());
    await waitFor(() => expect(
      screen.getByTestId("studio-widget-frame-delta-back").querySelector(".vo-delta-value")?.textContent,
    ).toBe("-0.150"));
  });

  it("applies the selected background and safe area inside an arbitrary scene", async () => {
    renderCanvas("fit", buildDocument({ width: 1000, height: 1000 }));
    await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

    const stage = screen.getByTestId("studio-canvas-stage");
    const scene = screen.getByTestId("studio-canvas-scene");
    expect(stage.className).not.toContain("osv3-bg-");
    expect(scene.className).toContain("osv3-bg-gradient");
    expect(screen.queryByTestId("studio-safe-area-overlay")).toBeNull();

    fireEvent.change(screen.getByTestId("studio-background-select"), {
      target: { value: "solid-black" },
    });
    fireEvent.click(screen.getByTestId("studio-safe-area-toggle"));

    expect(screen.getByTestId("studio-canvas-stage").className).not.toContain("osv3-bg-black");
    expect(screen.getByTestId("studio-canvas-scene").className).toContain("osv3-bg-black");
    const overlay = screen.getByTestId("studio-safe-area-overlay");
    expect(overlay.style.top).toBe(`${Math.round(1000 * SAFE_AREA_INSET_RATIO)}px`);
    expect(overlay.style.left).toBe(`${Math.round(1000 * SAFE_AREA_INSET_RATIO)}px`);
  });

  it("updates mock telemetry without dirtying the document", async () => {
    function DirtyProbe(): React.ReactElement {
      const { dirty } = useStudioDocument();
      return <div data-testid="dirty-flag">{dirty ? "dirty" : "clean"}</div>;
    }

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
            <DirtyProbe />
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-back")).toBeTruthy());
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");

    fireEvent.change(screen.getByTestId("studio-mock-session-select"), {
      target: { value: "qualifying" },
    });
    fireEvent.change(screen.getByTestId("studio-mock-location-select"), {
      target: { value: "pits" },
    });

    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("renders disconnected delta when live source loses LMU", async () => {
    const coordinator = createTelemetryRateCoordinator();
    coordinator.publish(
      buildMockTelemetry({ session: "practice", location: "track", state: "ready" }),
    );
    const telemetryAdapter = {
      coordinator,
      start() {
        coordinator.publish(
          buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }),
        );
        coordinator.setOverlayFrame(coordinator.getOverlayFrame(), { state: "stopped" });
      },
      stop() {
        return undefined;
      },
    };

    function ForceLiveSource(): React.ReactElement {
      const { setPreview } = useStudioPreview();
      return (
        <button
          type="button"
          data-testid="force-live"
          onClick={() => setPreview({ source: "live" })}
        />
      );
    }

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider
            coordinator={coordinator}
            liveAvailable
            telemetryAdapter={telemetryAdapter}
          >
            <ForceLiveSource />
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("force-live")).toBeTruthy());
    fireEvent.click(screen.getByTestId("force-live"));
    await waitFor(() => {
      const delta = screen
        .getByTestId("studio-widget-frame-delta-back")
        .querySelector(".vo-delta-value");
      expect(delta?.textContent).toBe("—");
      expect(
        screen
          .getByTestId("studio-widget-frame-delta-back")
          .querySelector("[data-status='disconnected']"),
      ).toBeTruthy();
    });
  });
});
