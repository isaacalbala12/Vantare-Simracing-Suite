import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "./core/profile-document";
import { ObsOverlayApp } from "./ObsOverlayApp";
import { deltaDefinition } from "./widget-types/delta/delta-definition";

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
  addEventListener = vi.fn();
  close = vi.fn();
  constructor(_url: string) {
    void _url;
    MockEventSource.instances.push(this);
  }
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads profile-v3 and starts one SSE adapter", async () => {
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
    expect(MockEventSource.instances).toHaveLength(1);
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
    expect(screen.getByTestId("obs-studio-preview-scene")).toBeTruthy();
    expect(screen.getByTestId("runtime-widget-frame")).toBeTruthy();
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