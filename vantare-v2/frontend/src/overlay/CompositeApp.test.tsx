import { act, cleanup, render, screen } from "@testing-library/react";
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
});
