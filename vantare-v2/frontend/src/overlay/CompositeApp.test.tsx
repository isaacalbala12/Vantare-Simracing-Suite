import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompositeApp } from "./CompositeApp";
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

describe("CompositeApp", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    resetTelemetryRef();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("applies telemetry:update events to runtime widgets", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        displayMode: "racing",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "racing",
    });

    tick(100);
    expect(screen.getByText("No player")).toBeTruthy();

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
    tick(100);

    expect(screen.getByText("Isaac Albala")).toBeTruthy();
  });

  it("renders engineer-notifications widget without crash or warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "engineer-test",
        displayMode: "racing",
        widgets: [
          {
            id: "engineer-notif-1",
            type: "engineer-notifications",
            enabled: true,
            updateHz: 5,
            position: { x: 100, y: 100, w: 300, h: 80 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "racing",
    });

    tick(100);
    // Should NOT log warning for unknown widget type
    expect(warnSpy).not.toHaveBeenCalled();
    // In runtime without active notification, nothing visible is expected (renders null)
    // The widget is mounted and listening via transport="wails" (__engineerTransport)
    warnSpy.mockRestore();
  });

  it("renders only enabled widgets", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        displayMode: "racing",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
          {
            id: "standings",
            type: "standings",
            enabled: false,
            updateHz: 15,
            position: { x: 0, y: 300, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "racing",
    });

    tick(100);
    expect(screen.getByText("RELATIVE")).toBeTruthy();
    expect(screen.queryByText("HYPERCAR")).toBeNull();
  });

  it("enters edit mode when windowMode is edit and shows the edit chrome", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-edit",
        displayMode: "edit",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "edit",
    });

    tick(100);
    expect(screen.getByTestId("edit-mode-chip")).toBeTruthy();
    expect(screen.getByTestId("edit-frame-relative")).toBeTruthy();
  });

  it("toggles edit mode via overlay:edit-mode-changed", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        displayMode: "racing",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "racing",
    });

    tick(100);
    expect(screen.queryByTestId("edit-mode-chip")).toBeNull();

    dispatch("overlay:edit-mode-changed", { mode: "edit" });
    tick(100);
    expect(screen.getByTestId("edit-mode-chip")).toBeTruthy();

    dispatch("overlay:edit-mode-changed", { mode: "racing" });
    tick(100);
    expect(screen.queryByTestId("edit-mode-chip")).toBeNull();
  });

  it("does not emit profile:request on layout:saved while in edit mode", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-edit",
        displayMode: "edit",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "edit",
    });

    tick(100);
    runtimeMock.emit.mockClear();
    dispatch("layout:saved", { ok: true });
    tick(100);

    expect(runtimeMock.emit).not.toHaveBeenCalledWith("profile:request");
  });

  it("emits profile:request on layout:saved while in racing mode", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-racing",
        displayMode: "racing",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "racing",
    });

    tick(100);
    runtimeMock.emit.mockClear();
    dispatch("layout:saved", { ok: true });
    tick(100);

    expect(runtimeMock.emit).toHaveBeenCalledWith("profile:request");
  });

  it("emits layout:save after dragging a widget in edit mode", () => {
    render(<CompositeApp />);
    dispatch("profile:loaded", {
      profile: {
        id: "default-edit",
        displayMode: "edit",
        widgets: [
          {
            id: "relative",
            type: "relative",
            enabled: true,
            updateHz: 15,
            position: { x: 0, y: 0, w: 320, h: 280 },
          },
        ],
      },
      layoutOrigin: { x: 0, y: 0 },
      windowMode: "edit",
    });

    tick(100);
    runtimeMock.emit.mockClear();

    const frame = screen.getByTestId("edit-frame-relative");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });
    fireEvent.mouseUp(window);

    tick(100);
    expect(runtimeMock.emit).toHaveBeenCalledWith("layout:save", expect.any(Object));
  });
});
