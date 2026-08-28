import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { createTestTelemetryCoordinator } from "../../hub/overlay-studio/test-helpers";
import { buildMockTelemetry } from "../core/mock-scenarios";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { InPlaceEditOverlay } from "./InPlaceEditOverlay";
import goldenV2Raw from "../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayUpdateV2 } from "../../generated/telemetry";

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

function renderOverlay(document: ProfileDocumentV3, revision = "rev-1") {
  const coordinator = createTestTelemetryCoordinator();
  coordinator.publish(buildMockTelemetry({ session: "race", location: "track" }));
  const update = JSON.parse(goldenV2Raw) as OverlayUpdateV2;
  coordinator.setOverlayFrame(update.frame ?? undefined, update.source);
  render(
    <InPlaceEditOverlay
      document={document}
      revision={revision}
      layoutOrigin={{ x: 0, y: 0 }}
      telemetry={coordinator}
    />,
  );
  return coordinator;
}

async function mockSceneAndWaitForFrame(frameTestId: string) {
  await waitFor(() => expect(screen.getByTestId(frameTestId)).toBeTruthy());
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
}

function saveCalls() {
  return runtimeMock.emit.mock.calls.filter(([name]) => name === "overlay:edit-layout:save");
}

beforeEach(() => {
  installResizeObserver();
  runtimeMock.emit.mockClear();
  runtimeMock.handlers.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  globalThis.ResizeObserver = originalResizeObserver;
});

/**
 * Aserciones negativas ("no se guardo nada"): en vez de dormir 50 ms reales,
 * se adelanta el reloj falso muy por encima de cualquier debounce y se vacian
 * las microtareas. Determinista y sin espera real.
 */
async function settleWithoutSaves(): Promise<void> {
  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe("InPlaceEditOverlay", () => {
  it("renders edit frames with chrome for every widget of the active layout", async () => {
    renderOverlay(buildDocument());

    await waitFor(() => expect(screen.getByTestId("inplace-edit-frame-delta-main")).toBeTruthy());
    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();
    expect(screen.getByTestId("edit-mode-chip")).toBeTruthy();
    expect(screen.getByTestId("edit-mode-hint")).toBeTruthy();
  });

  it("emits overlay:edit-layout:save with the committed layout on drag release", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { requestId: string; expectedRevision: string; document: ProfileDocumentV3 };
    expect(payload.expectedRevision).toBe("rev-1");
    const layout = payload.document.layouts.general.widgets[0].layout;
    expect(layout.x).toBe(152);
    expect(layout.y).toBe(152);
  });

  it("does not save when the pointer did not move", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await settleWithoutSaves();
    expect(saveCalls()).toHaveLength(0);
  });

  it("updates the store revision when studio:profile:saved matches its request id", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { requestId: string };
    dispatch("studio:profile:saved", { requestId: payload.requestId, revision: "rev-2", document: buildDocument() });

    // El siguiente drag usa la revision nueva: el save posterior lleva rev-2.
    fireEvent.pointerDown(frame, { pointerId: 2, button: 0, clientX: 152, clientY: 152, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 200, clientY: 200, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 2, bubbles: true });

    await waitFor(() => expect(saveCalls().length).toBeGreaterThanOrEqual(2));
    const second = saveCalls()[1][1] as { expectedRevision: string };
    expect(second.expectedRevision).toBe("rev-2");
  });

  it("shows the save error chip on studio:profile:conflict for its request id", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { requestId: string };
    dispatch("studio:profile:conflict", { requestId: payload.requestId });

    await waitFor(() => expect(screen.getByTestId("edit-mode-save-error")).toBeTruthy());
  });

  it("shows a center guide while dragging near the viewport center", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 820, clientY: 100, bubbles: true });

    const guides = screen.queryAllByTestId("inplace-edit-guide-vertical");
    const centerGuide = guides.find((guide) => guide.getAttribute("data-guide-kind") === "center");
    expect(centerGuide).toBeTruthy();
    expect(centerGuide?.style.left).toBe("960px");

    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });
    await waitFor(() => expect(screen.queryByTestId("inplace-edit-guide-vertical")).toBeNull());
  });

  it("edits the resolved general fallback without materializing race", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { document: ProfileDocumentV3 };
    expect(payload.document.layouts.general.widgets[0].layout.x).toBe(152);
    expect(payload.document.layouts.race).toBeUndefined();
  });

  it("edits race only when race is the resolved layout", async () => {
    renderOverlay(buildRaceDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-race");

    const frame = screen.getByTestId("inplace-edit-frame-delta-race") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 200, clientY: 200, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 248, clientY: 248, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { document: ProfileDocumentV3 };
    expect(payload.document.layouts.race?.widgets[0].layout.x).toBe(248);
    expect(payload.document.layouts.general.widgets[0].layout.x).toBe(100);
  });

  it("ignores studio:profile:saved for other request ids", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    dispatch("studio:profile:saved", { requestId: "other-request", revision: "rev-other", document: buildDocument() });

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });
    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { expectedRevision: string };
    expect(payload.expectedRevision).toBe("rev-1");
  });

  it("keeps imperative preview and frozen telemetry across StudioProvider rerenders during drag", async () => {
    renderOverlay(buildDocument());
    await mockSceneAndWaitForFrame("inplace-edit-frame-delta-main");

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
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

    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 148, clientY: 148, bubbles: true });

    // El DOM imperativo esta en la preview (152, snap de 148) mientras el
    // documento sigue en 100.
    const previewLeft = readFrameVisualLeft(frame);
    expect(previewLeft).toBe(152);

    // Durante el gesto, un comando no geometrico no toca la preview ni crea
    // guardados: el gesto aun no ha terminado.
    expect(saveCalls()).toHaveLength(0);

    fireEvent.pointerUp(window, { pointerId: 1, bubbles: true });

    // Al soltar: un unico save con el layout commitado.
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const payload = saveCalls()[0][1] as { document: ProfileDocumentV3 };
    expect(payload.document.layouts.general.widgets[0].layout.x).toBe(152);
  });
});

function readFrameVisualLeft(frame: HTMLElement): number {
  const base = Number.parseFloat(frame.style.left || "0");
  const transform = frame.style.transform;
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) {
    return base;
  }
  return base + Number.parseFloat(match[1]);
}
