import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { createTelemetryStore, type TelemetryStore } from "../../../overlay/core/telemetry-store";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { StudioProvider, useStudioDocument } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioCanvas } from "./StudioCanvas";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";
import { applyMovePreview, applyResizePreview } from "./useCanvasInteraction";

function buildDocument(): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta-main");
  delta.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [delta],
      },
    },
  };
}

const client: StudioProfileClient = {
  load: async () => ({ document: buildDocument(), revision: "rev-1" }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function DispatchRecorder(): React.ReactElement {
  const { dirty } = useStudioDocument();
  return <div data-testid="dirty-flag">{dirty ? "dirty" : "clean"}</div>;
}

function renderInteractiveCanvas(): TelemetryStore {
  const mockStore = createTelemetryStore(
    buildMockTelemetry({ session: "race", location: "track", state: "ready" }),
  );

  render(
    <div style={{ width: 960, height: 540 }}>
      <StudioProvider client={client} initialFile="profiles/a.json">
        <StudioTelemetryProvider mockStore={mockStore} liveStore={mockStore} liveAvailable={false}>
          <DispatchRecorder />
          <StudioCanvas />
        </StudioTelemetryProvider>
      </StudioProvider>
    </div>,
  );
  return mockStore;
}

function mockSceneRect(): void {
  const scene = () => screen.getByTestId("studio-canvas-scene");
  scene().getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1920,
    bottom: 1080,
    width: 1920,
    height: 1080,
    toJSON: () => ({}),
  });
}

function pointerDownFrame(pointerId = 1): void {
  const frame = screen.getByTestId("studio-widget-frame-delta-main");
  fireEvent.pointerDown(frame, { pointerId, button: 0, clientX: 100, clientY: 100, bubbles: true });
}

function pointerMove(
  clientX: number,
  clientY: number,
  pointerId = 1,
  options: { altKey?: boolean } = {},
): void {
  fireEvent.pointerMove(window, {
    pointerId,
    clientX,
    clientY,
    altKey: options.altKey ?? false,
    bubbles: true,
  });
}

function pointerUp(pointerId = 1): void {
  fireEvent.pointerUp(window, { pointerId, bubbles: true });
}

function readFrameVisualLeft(frame: HTMLElement): number {
  const base = Number.parseFloat(frame.style.left || "0");
  const transform = frame.style.transform;
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) {
    return base;
  }
  return base + Number.parseFloat(match[1]);
}

describe("applyMovePreview", () => {
  it("snaps unless Alt disables snapping", () => {
    const start = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
    const snapped = applyMovePreview({
      start,
      pointerOrigin: { x: 100, y: 100 },
      pointerCurrent: { x: 103, y: 107 },
      siblings: [],
      disableSnap: false,
    });
    expect(snapped.layout.x).toBe(104);
    expect(snapped.layout.y).toBe(104);
    expect(snapped.guides.length).toBeGreaterThan(0);

    const raw = applyMovePreview({
      start,
      pointerOrigin: { x: 100, y: 100 },
      pointerCurrent: { x: 103, y: 107 },
      siblings: [],
      disableSnap: true,
    });
    expect(raw.layout.x).toBe(103);
    expect(raw.layout.y).toBe(107);
    expect(raw.guides).toEqual([]);
  });
});

describe("applyResizePreview", () => {
  it("preserves aspect ratio for locked delta resize", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const start = widget.layout;
    const preview = applyResizePreview({
      widget,
      start,
      handle: "se",
      pointerOrigin: { x: 0, y: 0 },
      pointerCurrent: { x: 100, y: 40 },
      siblings: [],
      disableSnap: true,
    });
    expect(preview.layout.w / preview.layout.h).toBeCloseTo(start.w / start.h, 2);
    expect(preview.layout.w).toBeGreaterThanOrEqual(120);
    expect(preview.layout.h).toBeGreaterThanOrEqual(48);
  });
});

describe("useCanvasInteraction", () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("enters move mode synchronously on pointer-down", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-interaction")).toBe("move");
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalled();
  });

  it("updates transient geometry on pointer-move without dirtying the document", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-interaction")).toBe("move");

    pointerMove(140, 130, 1, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(140);
    });
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("updates frame geometry on every pointer-move during drag", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    const frame = screen.getByTestId("studio-widget-frame-delta-main");
    pointerDownFrame();
    pointerMove(120, 110, 1, { altKey: true });
    await waitFor(() => {
      const left = readFrameVisualLeft(frame);
      expect(left).toBeGreaterThan(100);
      expect(left).toBeLessThan(130);
    });

    pointerMove(160, 140, 1, { altKey: true });
    await waitFor(() => {
      const left = readFrameVisualLeft(frame);
      expect(left).toBeGreaterThan(140);
      expect(left).toBeLessThan(180);
    });
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("keeps imperative preview when telemetry publishes during drag", async () => {
    const mockStore = renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerMove(140, 130, 1, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(140);
    });

    mockStore.publish(
      buildMockTelemetry({ session: "practice", location: "pits", state: "ready" }),
    );

    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(140);
    });
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("does not teleport on the first pointer-move after pointer-down", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    const frame = screen.getByTestId("studio-widget-frame-delta-main");
    expect(frame.style.left).toBe("100px");

    pointerDownFrame();
    pointerMove(112, 108, 1, { altKey: true });

    await waitFor(() => expect(readFrameVisualLeft(frame)).toBeGreaterThan(100));
    const left = readFrameVisualLeft(frame);
    expect(left).toBeLessThan(130);
  });

  it("dispatches exactly one widget/layout command on pointer-up after movement", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerMove(140, 130, 1, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(140);
    });
    pointerUp();

    await waitFor(() => expect(screen.getByTestId("dirty-flag").textContent).toBe("dirty"));
    expect(screen.getByTestId("studio-widget-frame-delta-main").style.left).toBe("140px");
    expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-interaction")).toBe("idle");
  });

  it("does not dispatch when pointer-up happens without movement", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerUp();

    await waitFor(() =>
      expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-interaction")).toBe("idle"),
    );
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("restores geometry and skips dispatch when Escape is pressed", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerMove(180, 160, 1, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(180);
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.getByTestId("studio-widget-frame-delta-main").style.left).toBe("100px"),
    );
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("cancels safely on lost pointer capture", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerMove(180, 160, 1, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(readFrameVisualLeft(frame)).toBe(180);
    });
    fireEvent.lostPointerCapture(window, { pointerId: 1, bubbles: true });

    await waitFor(() =>
      expect(screen.getByTestId("studio-widget-frame-delta-main").style.left).toBe("100px"),
    );
    expect(screen.getByTestId("dirty-flag").textContent).toBe("clean");
  });

  it("shows guides only during interaction", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    expect(screen.queryByTestId("studio-canvas-guides")).toBeNull();

    pointerDownFrame();
    pointerMove(103, 107);
    await waitFor(() => expect(screen.getByTestId("studio-canvas-guides")).toBeTruthy());

    pointerUp();
    await waitFor(() => expect(screen.queryByTestId("studio-canvas-guides")).toBeNull());
  });

  it("resizes from a handle with aspect lock", async () => {
    renderInteractiveCanvas();
    await waitFor(() => expect(screen.getByTestId("studio-widget-frame-delta-main")).toBeTruthy());
    mockSceneRect();

    pointerDownFrame();
    pointerUp();
    await waitFor(() =>
      expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-selected-widget-id")).toBe(
        "delta-main",
      ),
    );
    expect(screen.getByTestId("studio-resize-handle-se-delta-main")).toBeTruthy();

    const handle = screen.getByTestId("studio-resize-handle-se-delta-main");
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 380, clientY: 196, bubbles: true });
    pointerMove(480, 236, 2, { altKey: true });
    await waitFor(() => {
      const frame = screen.getByTestId("studio-widget-frame-delta-main");
      expect(Number.parseFloat(frame.style.width)).toBeGreaterThan(280);
    });
    fireEvent.pointerUp(window, { pointerId: 2, bubbles: true });

    await waitFor(() => expect(screen.getByTestId("dirty-flag").textContent).toBe("dirty"));
    const frame = screen.getByTestId("studio-widget-frame-delta-main");
    const width = Number.parseFloat(frame.style.width);
    const height = Number.parseFloat(frame.style.height);
    expect(width / height).toBeCloseTo(280 / 96, 2);
  });
});