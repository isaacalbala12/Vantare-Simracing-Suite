import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsOverlayApp } from "./ObsOverlayApp";
import { resetTelemetryRef } from "../lib/telemetry-ref";

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
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
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

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ObsOverlayApp", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    resetTelemetryRef();
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("accepts engineer-notifications widget without crash", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            profile: {
              id: "obs-engineer-test",
              displayMode: "streaming",
              widgets: [
                {
                  id: "eng-obs",
                  type: "engineer-notifications",
                  enabled: true,
                  updateHz: 5,
                  position: { x: 50, y: 50, w: 300, h: 80 },
                },
              ],
            },
            layoutOrigin: { x: 0, y: 0 },
          }),
      } as Response),
    );

    render(<ObsOverlayApp />);
    tick(100);

    expect(screen.queryByText("Failed to load profile")).toBeNull();
  });

  it("shows calendar reminder banner on calendar:reminder event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            profile: {
              id: "obs-test",
              displayMode: "streaming",
              widgets: [],
            },
            layoutOrigin: { x: 0, y: 0 },
          }),
      } as Response),
    );

    render(<ObsOverlayApp />);
    await flush();

    expect(screen.queryByTestId("overlay-calendar-reminder-banner")).toBeNull();

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
          Promise.resolve({
            profile: {
              id: "obs-test",
              displayMode: "streaming",
              widgets: [],
            },
            layoutOrigin: { x: 0, y: 0 },
          }),
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

    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    await flush();

    expect(screen.queryByTestId("overlay-calendar-reminder-banner")).toBeNull();
  });
});
