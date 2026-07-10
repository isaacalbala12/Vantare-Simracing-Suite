import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { createTelemetryStore } from "../../../overlay/core/telemetry-store";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { StudioProvider, useStudioDocument, useStudioPreview } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioCanvas } from "./StudioCanvas";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";

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

function buildDocument(): ProfileDocumentV3 {
  const back = deltaDefinition.createDefault("delta-back");
  back.layout = { ...back.layout, x: 40, y: 40, zIndex: 0 };
  const front = deltaDefinition.createDefault("delta-front");
  front.layout = { ...front.layout, x: 200, y: 120, zIndex: 2 };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [front, back],
      },
    },
  };
}

const client: StudioProfileClient = {
  load: async () => ({ document: buildDocument(), revision: "rev-1" }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function renderCanvas(zoom: "fit" | 50 | 75 | 100 | 125 = "fit") {
  const mockStore = createTelemetryStore(
    buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
  );
  const liveStore = createTelemetryStore(
    buildMockTelemetry({ session: "practice", location: "pits", state: "ready" }),
  );

  function ZoomSetter(): React.ReactElement | null {
    const { setPreview } = useStudioPreview();
    if (zoom === "fit") {
      return null;
    }
    return (
      <button type="button" data-testid="set-zoom" onClick={() => setPreview({ zoom })} />
    );
  }

  return render(
    <div style={{ width: 960, height: 540 }}>
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider mockStore={mockStore} liveStore={liveStore} liveAvailable={false}>
          <ZoomSetter />
          <StudioCanvas />
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

    const mockStore = createTelemetryStore(
      buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
    );

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider
            mockStore={mockStore}
            liveStore={mockStore}
            liveAvailable={false}
          >
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
    const mockStore = createTelemetryStore(
      buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
    );

    render(
      <div style={{ width: 960, height: 540 }}>
        <StudioProvider client={client} initialFile="profiles/a.json">
          <StudioTelemetryProvider
            mockStore={mockStore}
            liveStore={mockStore}
            liveAvailable={false}
          >
            <StudioCanvas />
          </StudioTelemetryProvider>
        </StudioProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-back")).toBeTruthy());
    expect(
      screen.getByTestId("studio-widget-frame-delta-back").querySelector(".vo-delta-value")?.textContent,
    ).toBe("-0.150");
  });
});