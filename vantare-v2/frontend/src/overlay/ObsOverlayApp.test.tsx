import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "./core/profile-document";
import { ObsOverlayApp } from "./ObsOverlayApp";
import { deltaDefinition } from "./widget-types/delta/delta-definition";
import goldenV2Raw from "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
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

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  private readonly listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  addEventListener = vi.fn((name: string, listener: (event: { data: unknown }) => void) => {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  });
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  dispatch(name: string, data: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) listener({ data });
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
let runtimeOutput = { width: 1600, height: 900 };
let previewOutput = { width: 1600, height: 900 };

function installResizeObserver(): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      const element = target as HTMLElement;
      let size = runtimeOutput;
      if (element.dataset.testid === "obs-studio-preview-stage") {
        size = previewOutput;
      } else {
        const previewScene = element.closest<HTMLElement>('[data-testid="obs-studio-preview-scene"]');
        if (previewScene) {
          size = {
            width: Number.parseFloat(previewScene.style.width),
            height: Number.parseFloat(previewScene.style.height),
          };
        }
      }
      this.callback(
        [{
          target,
          contentBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
          contentRect: { width: size.width, height: size.height },
        } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
}

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

function buildApiResponse(document: ProfileDocumentV3, layoutOrigin = { x: 0, y: 0 }) {
  return {
    document,
    revision: "rev-obs-1",
    layoutOrigin,
  };
}

describe("ObsOverlayApp", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    MockEventSource.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    runtimeOutput = { width: 1600, height: 900 };
    previewOutput = { width: 1600, height: 900 };
    installResizeObserver();
  });

  it("R4 OBS V2-only: abre exactamente V2 + Engineer, sin V1 ni shadow, y cierra ambos al desmontar", async () => {
    const delta = deltaDefinition.createDefault("delta-r4");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildApiResponse({
        schemaVersion: 3,
        id: "obs-r4-v2-only",
        name: "OBS R4 V2-only",
        displayMode: "streaming",
        monitorIndex: 0,
        layouts: { general: { type: "general", widgets: [delta] } },
      })),
    } as Response));
    const view = render(<ObsOverlayApp />);
    await flush();

    expect(MockEventSource.instances.map((source) => source.url)).toEqual([
      "/telemetry/overlay-v2/projection",
      "/engineer/stream",
    ]);
    expect(MockEventSource.instances.some(
      (source) => source.url === "/telemetry/overlay/projection",
    )).toBe(false);

    const overlayV2 = MockEventSource.instances.find(
      (source) => source.url === "/telemetry/overlay-v2/projection",
    );
    act(() => overlayV2?.dispatch("telemetry:overlay-v2:snapshot", goldenV2Raw));

    expect(screen.getAllByTestId("runtime-widget-frame")).toHaveLength(1);
    const diagnostics = window.__vantareOverlayV2Diagnostics?.() as Record<string, unknown> | undefined;
    expect(diagnostics).toBeDefined();
    expect(diagnostics).toMatchObject({ overlay_v2_parse_duration: { count: 1 } });
    expect(diagnostics).not.toHaveProperty("shadow");

    view.unmount();
    expect(MockEventSource.instances).toHaveLength(2);
    for (const source of MockEventSource.instances) {
      expect(source.close).toHaveBeenCalledTimes(1);
    }
    expect(window.__vantareOverlayV2Diagnostics).toBeUndefined();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("crea una generacion limpia y acepta frames V2 tras el doble setup de StrictMode", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const delta = deltaDefinition.createDefault("delta-strict");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildApiResponse({
        schemaVersion: 3,
        id: "obs-strict",
        name: "OBS Strict",
        displayMode: "streaming",
        monitorIndex: 0,
        layouts: { general: { type: "general", widgets: [delta] } },
      })),
    } as Response));

    render(
      <StrictMode>
        <ObsOverlayApp />
      </StrictMode>,
    );
    await flush();
    const activeV2 = MockEventSource.instances
      .filter((source) => source.url === "/telemetry/overlay-v2/projection")
      .at(-1);
    act(() => activeV2?.dispatch("telemetry:overlay-v2:snapshot", goldenV2Raw));

    expect(screen.getAllByTestId("runtime-widget-frame")).toHaveLength(1);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("invalid-contract:disposed");
    expect(MockEventSource.instances.some(
      (source) => source.url === "/telemetry/overlay/projection",
    )).toBe(false);
    const diagnostics = window.__vantareOverlayV2Diagnostics?.() as Record<string, unknown> | undefined;
    expect(diagnostics).toMatchObject({
      overlay_v2_parse_duration: { count: 1 },
    });
    expect(diagnostics).not.toHaveProperty("shadow");
    expect(MockEventSource.instances.filter((source) => !source.close.mock.calls.length)).toHaveLength(2);
    expect(MockEventSource.instances.filter((source) => source.close.mock.calls.length)).toHaveLength(2);
  });

  it("loads profile-v3 and starts canonical V2 plus Engineer SSE adapters without V1", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          buildApiResponse({
            schemaVersion: 3,
            id: "obs-test",
            name: "OBS Test",
            displayMode: "streaming",
            monitorIndex: 0,
            layouts: { general: { type: "general", widgets: [] } },
          }),
        ),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<ObsOverlayApp />);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/profile-v3?profile="));
    expect(MockEventSource.instances.map((source) => source.url)).toEqual([
      "/telemetry/overlay-v2/projection",
      "/engineer/stream",
    ]);
    expect(screen.getByTestId("runtime-overlay-surface")).toBeTruthy();
  });

  it("shows fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    expect(screen.getByText(/Failed to load profile/i)).toBeTruthy();
  });

  it("shows calendar reminder banner on calendar:reminder event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            buildApiResponse({
              schemaVersion: 3,
              id: "obs-test",
              name: "OBS Test",
              displayMode: "streaming",
              monitorIndex: 0,
              layouts: { general: { type: "general", widgets: [] } },
            }),
          ),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    dispatch("calendar:reminder", {
      eventId: "evt-1",
      title: "6h de Spa",
      track: "Spa-Francorchamps",
      minutesLeft: 15,
      startTime: "2026-07-02T20:00:00+02:00",
      registrationUrl: "",
    });
    await flush();

    expect(screen.getByTestId("overlay-calendar-reminder-banner")).toBeTruthy();
    expect(screen.getByText("6h de Spa")).toBeTruthy();
  });

  it("hides calendar reminder banner on close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            buildApiResponse({
              schemaVersion: 3,
              id: "obs-test",
              name: "OBS Test",
              displayMode: "streaming",
              monitorIndex: 0,
              layouts: { general: { type: "general", widgets: [] } },
            }),
          ),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    dispatch("calendar:reminder", {
      eventId: "evt-1",
      title: "6h de Spa",
      track: "Spa-Francorchamps",
      minutesLeft: 15,
      startTime: "2026-07-02T20:00:00+02:00",
      registrationUrl: "",
    });
    await flush();

    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    await flush();

    expect(screen.queryByTestId("overlay-calendar-reminder-banner")).toBeNull();
  });

  it("renders the studio preview shell when studioPreview=1 is present", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      search: "?profile=obs-preview.json&studioPreview=1",
    });
    const delta = deltaDefinition.createDefault("delta-preview");
    delta.layout = { ...delta.layout, x: 123, y: 87 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            buildApiResponse(
              {
                schemaVersion: 3,
                id: "obs-preview",
                name: "OBS Preview",
                displayMode: "streaming",
                monitorIndex: 0,
                layoutViewport: { width: 1000, height: 1000 },
                layouts: { general: { type: "general", widgets: [delta] } },
              },
              { x: 120, y: 96 },
            ),
          ),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    expect(screen.getByTestId("obs-studio-preview")).toBeTruthy();
    const previewScene = screen.getByTestId("obs-studio-preview-scene") as HTMLElement;
    const runtimeScene = screen.getByTestId("runtime-overlay-scene") as HTMLElement;
    const frame = screen.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(previewScene.style.width).toBe("1777.777778px");
    expect(previewScene.style.height).toBe("1000px");
    expect(previewScene.dataset.scale).toBe("0.9");
    expect(previewScene.dataset.offsetX).toBe("0");
    expect(runtimeScene.dataset.scale).toBe("1");
    expect(runtimeScene.dataset.offsetX).toBe("0");
    expect(runtimeScene.dataset.offsetY).toBe("0");
    expect(frame.style.left).toBe("218.666667px");
    expect(frame.style.top).toBe("87px");
  });

  it("keeps calendar reminders in output space outside the transformed document preview", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      search: "?profile=obs-preview-reminder.json&studioPreview=1",
    });
    previewOutput = { width: 1600, height: 900 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(buildApiResponse({
          schemaVersion: 3,
          id: "obs-preview-reminder",
          name: "OBS Preview Reminder",
          displayMode: "streaming",
          monitorIndex: 0,
          layoutViewport: { width: 1000, height: 1000 },
          layouts: { general: { type: "general", widgets: [] } },
        })),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();
    dispatch("calendar:reminder", {
      eventId: "evt-preview",
      title: "Preview reminder",
      track: "Spa-Francorchamps",
      minutesLeft: 15,
      startTime: "2026-07-02T20:00:00+02:00",
      registrationUrl: "",
    });
    await flush();

    const preview = screen.getByTestId("obs-studio-preview") as HTMLElement;
    const previewScene = screen.getByTestId("obs-studio-preview-scene") as HTMLElement;
    const runtime = screen.getByTestId("runtime-overlay-surface") as HTMLElement;
    const banner = screen.getByTestId("overlay-calendar-reminder-banner") as HTMLElement;
    expect(previewScene.dataset.scale).toBe("0.9");
    expect(previewScene.dataset.offsetX).toBe("0");
    expect(previewScene.contains(runtime)).toBe(true);
    expect(previewScene.contains(banner)).toBe(false);
    expect(preview.parentElement).toBe(banner.parentElement);
    expect(banner.className).toContain("top-4");
    expect(banner.className).toContain("right-4");
    expect(banner.style.transform).toBe("");

    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    await flush();
    expect(screen.queryByTestId("overlay-calendar-reminder-banner")).toBeNull();
  });

  it("uses the real output in streaming mode and ignores a shrink-wrap API origin", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      search: "?profile=obs-stream.json",
    });
    const delta = deltaDefinition.createDefault("delta-stream");
    delta.layout = { ...delta.layout, x: 123, y: 87 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(buildApiResponse({
          schemaVersion: 3,
          id: "obs-stream",
          name: "OBS Stream",
          displayMode: "streaming",
          monitorIndex: 0,
          layoutViewport: { width: 1000, height: 1000 },
          layouts: { general: { type: "general", widgets: [delta] } },
        }, { x: 120, y: 96 })),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    expect(screen.queryByTestId("obs-studio-preview")).toBeNull();
    const runtimeScene = screen.getByTestId("runtime-overlay-scene") as HTMLElement;
    const frame = screen.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(runtimeScene.style.transform).toBe("translate(0px, 0px) scale(0.9)");
    expect(frame.style.left).toBe("218.666667px");
    expect(frame.style.top).toBe("87px");
  });

  it("skips preserved legacy widgets at runtime", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            buildApiResponse({
              schemaVersion: 3,
              id: "obs-runtime-test",
              name: "OBS Runtime Test",
              displayMode: "streaming",
              monitorIndex: 0,
              layouts: {
                general: {
                  type: "general",
                  widgets: [],
                  preservedWidgets: [{ id: "bt-obs", type: "broadcast-tower", source: { id: "bt-obs" } }],
                },
              },
            }),
          ),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    expect(screen.queryAllByTestId("runtime-widget-frame")).toHaveLength(0);
  });
});
