import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "./core/profile-document";
import { CompositeApp } from "./CompositeApp";
import { relativeDefinition } from "./widget-types/relative/relative-definition";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  onCalls: [] as string[],
  emit: vi.fn(),
}));

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

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function buildProfilePayload(document: ProfileDocumentV3, revision = "rev-1") {
  return {
    document,
    revision,
    layoutOrigin: { x: 0, y: 0 },
    windowMode: "racing",
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
    runtimeMock.emit.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("subscribes once to overlay:profile-v3-loaded and telemetry:update", () => {
    render(<CompositeApp />);
    expect(runtimeMock.onCalls.filter((name) => name === "overlay:profile-v3-loaded")).toHaveLength(1);
    expect(runtimeMock.onCalls.filter((name) => name === "telemetry:update")).toHaveLength(1);
  });

  it("renders runtime widgets after overlay:profile-v3-loaded", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);
    expect(screen.getByText("RELATIVE")).toBeTruthy();
  });

  it("applies telemetry updates through the Wails adapter", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    dispatch("telemetry:update", {
      seq: 1,
      snapshot: {
        connected: true,
        vehicles: [
          { id: 1, driverName: "Other Driver", place: 1, timeBehindLeader: 0 },
          { id: 2, driverName: "Isaac Albala", place: 2, isPlayer: true, timeBehindLeader: 1.2 },
        ],
      },
    });
    tick(200);

    expect(screen.getByText("Isaac Albala")).toBeTruthy();
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

  it("does not mount edit chrome when overlay:edit-mode-changed fires", () => {
    render(<CompositeApp />);
    dispatch("overlay:profile-v3-loaded", buildProfilePayload(buildRelativeDocument()));
    tick(100);

    dispatch("overlay:edit-mode-changed", { mode: "edit" });
    tick(100);

    expect(screen.queryByTestId("edit-mode-hint")).toBeNull();
    expect(screen.queryByTestId("edit-frame-relative")).toBeNull();
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