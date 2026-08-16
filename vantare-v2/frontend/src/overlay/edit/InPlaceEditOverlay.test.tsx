import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTestTelemetryCoordinator } from "../../hub/overlay-studio/test-helpers";
import { buildMockTelemetry } from "../core/mock-scenarios";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { InPlaceEditOverlay } from "./InPlaceEditOverlay";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  onCalls: [] as string[],
  emit: vi.fn(),
}));

const originalResizeObserver = globalThis.ResizeObserver;

function installResizeObserver(): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [{
          target,
          contentBoxSize: [{ inlineSize: 1920, blockSize: 1080 }],
          contentRect: { width: 1920, height: 1080 },
        } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
}

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.onCalls.push(name);
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () =>
        runtimeMock.handlers.set(
          name,
          (runtimeMock.handlers.get(name) ?? []).filter((h) => h !== handler),
        );
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

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

function buildRaceDocument(): ProfileDocumentV3 {
  const base = buildDocument();
  return {
    ...base,
    layouts: {
      ...base.layouts,
      race: {
        type: "race",
        widgets: [
          {
            ...base.layouts.general.widgets[0],
            id: "delta-race",
            layout: { x: 200, y: 200, w: 280, h: 96, zIndex: 0, aspectLocked: true },
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  installResizeObserver();
  runtimeMock.emit.mockClear();
  runtimeMock.handlers.clear();
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("InPlaceEditOverlay", () => {
  it("renders edit frames with chrome for every widget of the active layout", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();
    expect(screen.getByTestId("inplace-edit-frame-delta-main")).toBeTruthy();
    expect(screen.getByTestId("edit-mode-chip")).toBeTruthy();
    expect(screen.getByTestId("edit-mode-hint")).toBeTruthy();
  });

  it("emits overlay:edit-layout:save with the committed layout on drag release", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const saveCalls = runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save");
    expect(saveCalls).toHaveLength(1);
    const payload = saveCalls[0][1] as { requestId: string; expectedRevision: string; document: ProfileDocumentV3 };
    expect(payload.expectedRevision).toBe("rev-1");
    const layout = payload.document.layouts.general.widgets[0].layout;
    expect(layout.x).toBe(152);
    expect(layout.y).toBe(152);
  });

  it("does not save when the pointer did not move", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const saveCalls = runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save");
    expect(saveCalls).toHaveLength(0);
  });

  it("updates the local revision when studio:profile:saved matches its request id", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const payload = runtimeMock.emit.mock.calls.find(([name]) => name === "overlay:edit-layout:save")?.[1] as { requestId: string };
    expect(payload).toBeTruthy();
    dispatch("studio:profile:saved", { requestId: payload.requestId, revision: "rev-2" });

    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 152, clientY: 152, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const secondSave = runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save")[1] as unknown as [string, { expectedRevision: string }];
    expect(secondSave[1].expectedRevision).toBe("rev-2");
  });

  it("shows the save error chip on studio:profile:conflict for its request id", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const payload = runtimeMock.emit.mock.calls.find(([name]) => name === "overlay:edit-layout:save")?.[1] as { requestId: string };
    dispatch("studio:profile:conflict", { requestId: payload.requestId });

    expect(screen.getByTestId("edit-mode-save-error")).toBeTruthy();
  });

  it("shows a center guide while dragging near the viewport center", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 820, clientY: 100, bubbles: true });

    const guides = screen.queryAllByTestId("inplace-edit-guide-vertical");
    const centerGuide = guides.find((guide) => guide.getAttribute("data-guide-kind") === "center");
    expect(centerGuide).toBeTruthy();
    expect(centerGuide?.style.left).toBe("960px");

    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });
    expect(screen.queryByTestId("inplace-edit-guide-vertical")).toBeNull();
  });

  it("edits the resolved general fallback without materializing race", () => {
    const coordinator = createTestTelemetryCoordinator();
    // Telemetria indica race, pero el perfil solo tiene general: el comando
    // debe ir a general y NO crear layouts.race.
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const saveCalls = runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save");
    expect(saveCalls).toHaveLength(1);
    const payload = saveCalls[0][1] as { document: ProfileDocumentV3 };
    expect(payload.document.layouts.general.widgets[0].layout.x).toBe(152);
    expect(payload.document.layouts.race).toBeUndefined();
  });

  it("edits race only when race is the resolved layout", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildRaceDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-race") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 200, clientY: 200, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 248, clientY: 248, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const saveCalls = runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save");
    expect(saveCalls).toHaveLength(1);
    const payload = saveCalls[0][1] as { document: ProfileDocumentV3 };
    expect(payload.document.layouts.race?.widgets[0].layout.x).toBe(248);
    expect(payload.document.layouts.general.widgets[0].layout.x).toBe(100);
  });

  it("ignores studio:profile:saved for other request ids", () => {
    const coordinator = createTestTelemetryCoordinator();
    coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));

    render(
      <InPlaceEditOverlay
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    dispatch("studio:profile:saved", { requestId: "other-request", revision: "rev-other" });

    const scene = screen.getByTestId("inplace-edit-scene") as HTMLElement;
    scene.getBoundingClientRect = () => ({
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

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    const payload = runtimeMock.emit.mock.calls.find(([name]) => name === "overlay:edit-layout:save")?.[1] as { expectedRevision: string };
    expect(payload.expectedRevision).toBe("rev-1");
  });
});
