import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "./core/profile-document";
import { CompositeApp } from "./CompositeApp";
import { relativeDefinition } from "./widget-types/relative/relative-definition";
import {
  OVERLAY_PULL_REQUEST_ROUTE,
} from "../telemetry-transport/overlay-wails-pull";
import goldenRaw from "../../../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json?raw";
import goldenV2Raw from "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  onCalls: [] as string[],
  emit: vi.fn(),
}));

const shadowRuntimeMock = vi.hoisted(() => ({
  acceptLegacy: vi.fn(),
  acceptOverlayV2: vi.fn(),
  create: vi.fn(),
}));

vi.mock("./telemetry-shadow/overlay-v2-shadow-runtime", () => ({
  createOverlayV2ShadowRuntime: shadowRuntimeMock.create,
}));

const originalResizeObserver = globalThis.ResizeObserver;
let desktopOutput = { width: 1920, height: 1080 };
let pullDelivery = 0;
let pullRequests: Array<{sessionId: string; ack: number}> = [];
let pullClosedSessions = new Set<string>();
let resolvePull: ((response: Response) => void) | undefined;

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
          contentBoxSize: [{ inlineSize: desktopOutput.width, blockSize: desktopOutput.height }],
          contentRect: { width: desktopOutput.width, height: desktopOutput.height },
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

async function dispatchTelemetry(events: ReadonlyArray<{name: string; data: unknown}>): Promise<void> {
  const request = pullRequests.at(-1);
  if (!request) throw new Error("overlay pull request not emitted");
  pullDelivery += 1;
  const resolve = resolvePull;
  if (!resolve) throw new Error("overlay pull response not pending");
  resolvePull = undefined;
  await act(async () => {
    resolve({
      ok: true,
      status: 200,
      json: async () => ({sessionId: request.sessionId, delivery: pullDelivery, events}),
    } as Response);
    await Promise.resolve();
  });
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function buildProfilePayload(document: ProfileDocumentV3, revision = "rev-1", windowMode = "racing") {
  return {
    document,
    revision,
    layoutOrigin: { x: 0, y: 0 },
    windowMode,
  };
}

function canonicalEnvelope() {
  const snapshot = JSON.parse(goldenRaw) as Record<string, unknown>;
  const payload = { ...snapshot };
  for (const key of ["canonicalVersion", "projectionVersion", "epoch", "sequence", "capturedAt"]) {
    delete payload[key];
  }
  return {
    product: "overlay",
    projectionVersion: snapshot.projectionVersion,
    epoch: snapshot.epoch,
    sequence: snapshot.sequence,
    kind: "full",
    capturedAt: snapshot.capturedAt,
    statusRevision: 1,
    payload,
  };
}

function buildRelativeDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "default-racing",
    name: "Default Racing",
    displayMode: "racing",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [relativeDefinition.createDefault("relative-main")],
      },
    },
  };
}

describe("CompositeApp", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.onCalls = [];
    runtimeMock.emit.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T09:00:00Z"));
    desktopOutput = { width: 1920, height: 1080 };
    pullDelivery = 0;
    pullRequests = [];
    pullClosedSessions = new Set();
    resolvePull = undefined;
    shadowRuntimeMock.acceptLegacy.mockReset();
    shadowRuntimeMock.acceptOverlayV2.mockReset();
    shadowRuntimeMock.create.mockReset().mockReturnValue({
      acceptLegacy: shadowRuntimeMock.acceptLegacy,
      acceptOverlayV2: shadowRuntimeMock.acceptOverlayV2,
      sessionSummary: () => ({ frames: 0, mismatches: 0 }),
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const route = typeof input === "string" ? input : input.toString();
      if (route === OVERLAY_PULL_REQUEST_ROUTE) {
        pullRequests.push(JSON.parse(String(init?.body)) as {sessionId: string; ack: number});
        return new Promise<Response>((resolve) => {
          resolvePull = resolve;
        });
      }
      if (route.endsWith("/close")) {
        const close = JSON.parse(String(init?.body)) as { sessionId: string };
        pullClosedSessions.add(close.sessionId);
      }
      return {ok: true, status: 204} as Response;
    }));
    installResizeObserver();
  });

  it("R2: un evento legacy V1 solo no alimenta Desktop (sin snapshot, sin shadow, sin widget V1)", async () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    await dispatchTelemetry([
      { name: "telemetry:overlay:status", data: {
        product: "overlay",
        statusRevision: 1,
        capturedAt: "2026-07-28T09:00:00Z",
        payload: { state: "live", reconnectAttempt: 0 },
      } },
      { name: "telemetry:overlay:projection", data: canonicalEnvelope() },
    ]);
    tick(200);

    expect(screen.queryByText("Driver 000")).toBeNull();
    expect(shadowRuntimeMock.create).not.toHaveBeenCalled();
    expect(shadowRuntimeMock.acceptLegacy).not.toHaveBeenCalled();
    const diagnostics = window.__vantareOverlayV2Diagnostics?.() as Record<string, unknown> | undefined;
    expect(diagnostics).toBeDefined();
    expect(diagnostics).not.toHaveProperty("shadow");
  });

  it("R2: un snapshot V2 solo sigue alimentando el runtime y unmount cierra el pull", async () => {
    const view = render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    await dispatchTelemetry([
      { name: "telemetry:overlay-v2:snapshot", data: JSON.parse(goldenV2Raw) },
    ]);
    tick(200);

    expect(screen.getByText("Driver 000")).toBeTruthy();
    expect(shadowRuntimeMock.create).not.toHaveBeenCalled();
    const sessionId = pullRequests.at(-1)?.sessionId;
    expect(sessionId).toBeDefined();

    view.unmount();
    tick(500);

    expect(pullClosedSessions.has(sessionId!)).toBe(true);
    expect(window.__vantareOverlayV2Diagnostics).toBeUndefined();
    expect(runtimeMock.handlers.get("overlay:profile-v3-loaded") ?? []).toHaveLength(0);
  });

  it("does not allocate or ingest shadow state while V1 emission is off", async () => {
    render(<CompositeApp />);

    await dispatchTelemetry([
      { name: "telemetry:overlay-v2:snapshot", data: JSON.parse(goldenV2Raw) },
    ]);

    expect(shadowRuntimeMock.create).not.toHaveBeenCalled();
    expect(shadowRuntimeMock.acceptOverlayV2).not.toHaveBeenCalled();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.ResizeObserver = originalResizeObserver;
    delete window.__vantareOverlayV2Features;
  });

  it("crea una generacion limpia y acepta frames V2 tras el doble setup de StrictMode", async () => {
    window.__vantareOverlayV2Features = ["relative"];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <StrictMode>
        <CompositeApp />
      </StrictMode>,
    );
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    await dispatchTelemetry([
      { name: "telemetry:overlay-v2:snapshot", data: JSON.parse(goldenV2Raw) },
    ]);
    tick(100);

    expect(screen.getAllByTestId("runtime-widget-frame")).toHaveLength(1);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("invalid-contract:disposed");
    expect(window.__vantareOverlayV2Diagnostics?.()).toMatchObject({
      overlay_v2_parse_duration: { count: 1 },
    });
    const activeSessions = new Set(
      pullRequests
        .map((request) => request.sessionId)
        .filter((sessionId) => !pullClosedSessions.has(sessionId)),
    );
    expect(activeSessions.size).toBe(1);
  });

  it("subscribes once to the profile and canonical Overlay transport", () => {
    render(<CompositeApp />);
    expect(runtimeMock.onCalls.filter((name) => name === "overlay:profile-v3-loaded")).toHaveLength(1);
    expect(runtimeMock.emit).toHaveBeenCalledWith("overlay:profile-v3:get");
    expect(runtimeMock.onCalls.filter((name) => name === "telemetry:update")).toHaveLength(0);
    expect(runtimeMock.onCalls.filter((name) => name === "telemetry:overlay:status")).toHaveLength(0);
    expect(runtimeMock.onCalls.filter((name) => name === "telemetry:overlay:projection")).toHaveLength(0);
    expect(pullRequests).toHaveLength(1);
  });

  it("paints nothing at all until the profile arrives", () => {
    // La ventana de overlay es una capa transparente sobre el juego y sobre la
    // emision. Cualquier marcador de carga aqui se ve centrado en pantalla
    // durante los ~390 ms que tarda la WebView en arrancar y desaparece de
    // golpe: ese era el salto al abrir un overlay con la hotkey.
    const { container } = render(<CompositeApp />);
    expect(container.textContent).toBe("");
  });

  it("recovers the active profile when the initial window event was emitted before mount", () => {
    runtimeMock.emit.mockImplementation((name: string) => {
      if (name !== "overlay:profile-v3:get") {
        return;
      }
      for (const handler of runtimeMock.handlers.get("overlay:profile-v3-loaded") ?? []) {
        handler({ data: buildProfilePayload(buildRelativeDocument()) });
      }
    });

    render(<CompositeApp />);
    tick(100);

    expect(screen.queryByText("Loading profile...")).toBeNull();
    expect(screen.getByText("Overlay V2 frame unavailable")).toBeTruthy();
  });

  it("renders runtime widgets after overlay:profile-v3-loaded", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);
    expect(screen.getByText("Overlay V2 frame unavailable")).toBeTruthy();
  });

  it("applies the Overlay V2 snapshot from the HTTP response", async () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    await dispatchTelemetry([
      {name: "telemetry:overlay-v2:snapshot", data: JSON.parse(goldenV2Raw)},
    ]);
    tick(200);

    expect(screen.getByText("Driver 000")).toBeTruthy();
  });

  it("renders a transparent empty surface for an empty profile", () => {
    const empty: ProfileDocumentV3 = {
      schemaVersion: 3,
      id: "empty",
      name: "Empty",
      displayMode: "racing",
      monitorIndex: 0,
      layouts: { general: { type: "general", widgets: [] } },
    };

    const view = render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(empty));
    tick(100);

    const surface = view.getByTestId("runtime-overlay-surface") as HTMLElement;
    expect(surface.style.background).toBe("transparent");
    expect(view.queryAllByTestId("runtime-widget-frame")).toHaveLength(0);
  });

  it("refreshes the runtime surface when revision changes", () => {
    const view = render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument(), "rev-a"));
    tick(100);
    expect(view.getAllByTestId("runtime-widget-frame")).toHaveLength(1);

    const next = buildRelativeDocument();
    next.layouts.general.widgets[0].layout.x = 120;
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(next, "rev-b"));
    tick(100);

    const frame = view.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(frame.style.left).toBe("120px");
  });

  it("renders an arbitrary desktop document against the real output with zero logical origin", () => {
    desktopOutput = { width: 1600, height: 900 };
    const document = buildRelativeDocument();
    document.layoutViewport = { width: 1000, height: 1000 };
    document.layouts.general.widgets[0].layout = {
      ...document.layouts.general.widgets[0].layout,
      x: 123,
      y: 87,
    };

    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(document));
    tick(100);

    const scene = screen.getByTestId("runtime-overlay-scene") as HTMLElement;
    const frame = screen.getByTestId("runtime-widget-frame") as HTMLElement;
    expect(scene.style.transform).toBe("translate(0px, 0px) scale(0.9)");
    expect(frame.style.left).toBe("218.666667px");
    expect(frame.style.top).toBe("87px");
  });

  it("mounts edit chrome when overlay:edit-mode-changed fires", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    expect(screen.queryByTestId("edit-mode-hint")).toBeNull();
    expect(screen.queryByTestId("inplace-edit-overlay")).toBeNull();

    dispatch("overlay:edit-mode-changed", { mode: "edit" });
    tick(100);

    expect(screen.getByTestId("edit-mode-hint")).toBeTruthy();
    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();
  });

  it("returns to the runtime surface when overlay:edit-mode-changed sets racing", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument(), "rev-1", "edit"));
    tick(100);

    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();

    dispatch("overlay:edit-mode-changed", { mode: "racing" });
    tick(100);

    expect(screen.queryByTestId("inplace-edit-overlay")).toBeNull();
    expect(screen.getByTestId("runtime-overlay-surface")).toBeTruthy();
  });

  it("enters edit mode from windowMode in the profile payload", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument(), "rev-1", "edit"));
    tick(100);

    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();
    expect(screen.queryByTestId("runtime-overlay-surface")).toBeNull();
  });

  it("shows calendar reminder banner on calendar:reminder event", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    dispatch("calendar:reminder", {
      eventId: "evt-1",
      title: "6h de Spa",
      track: "Spa-Francorchamps",
      minutesLeft: 15,
      startTime: "2026-07-02T20:00:00+02:00",
      registrationUrl: "",
    });
    tick(100);

    expect(screen.getByTestId("overlay-calendar-reminder-banner")).toBeTruthy();
    expect(screen.getByText("6h de Spa")).toBeTruthy();
  });

  it("hides calendar reminder banner on close", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    dispatch("calendar:reminder", {
      eventId: "evt-1",
      title: "6h de Spa",
      track: "Spa-Francorchamps",
      minutesLeft: 15,
      startTime: "2026-07-02T20:00:00+02:00",
      registrationUrl: "",
    });
    tick(100);

    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    tick(100);

    expect(screen.queryByTestId("overlay-calendar-reminder-banner")).toBeNull();
  });
});
