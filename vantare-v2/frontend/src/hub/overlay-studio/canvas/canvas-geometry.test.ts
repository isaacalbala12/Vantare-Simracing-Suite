import { describe, expect, it } from "vitest";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clientToLogical,
  clampRecoverableLayout,
  resolveCanvasScale,
  snapToGrid,
} from "./canvas-geometry";

describe("resolveCanvasScale", () => {
  it("fits the canvas inside the container without upscaling above 100%", () => {
    expect(resolveCanvasScale({ containerWidth: 1920, containerHeight: 1080, zoom: "fit" })).toBe(1);
    expect(resolveCanvasScale({ containerWidth: 960, containerHeight: 540, zoom: "fit" })).toBe(0.5);
    expect(resolveCanvasScale({ containerWidth: 3840, containerHeight: 2160, zoom: "fit" })).toBe(1);
    expect(resolveCanvasScale({ containerWidth: 800, containerHeight: 600, zoom: "fit" })).toBeCloseTo(800 / 1920, 5);
  });

  it("uses explicit zoom percentages", () => {
    expect(resolveCanvasScale({ containerWidth: 1200, containerHeight: 800, zoom: 50 })).toBe(0.5);
    expect(resolveCanvasScale({ containerWidth: 1200, containerHeight: 800, zoom: 75 })).toBe(0.75);
    expect(resolveCanvasScale({ containerWidth: 1200, containerHeight: 800, zoom: 100 })).toBe(1);
    expect(resolveCanvasScale({ containerWidth: 1200, containerHeight: 800, zoom: 125 })).toBe(1.25);
  });

  it("never returns NaN or Infinity", () => {
    const scale = resolveCanvasScale({ containerWidth: 0, containerHeight: 0, zoom: "fit" });
    expect(Number.isFinite(scale)).toBe(true);
  });
});

describe("clientToLogical", () => {
  const rect = { left: 100, top: 50, width: 960, height: 540 };

  it("maps client coordinates at multiple zoom levels", () => {
    expect(clientToLogical({ x: 100, y: 50 }, rect, 0.5)).toEqual({ x: 0, y: 0 });
    expect(clientToLogical({ x: 580, y: 290 }, rect, 0.5)).toEqual({ x: 960, y: 480 });
    expect(clientToLogical({ x: 1060, y: 590 }, rect, 1)).toEqual({ x: 960, y: 540 });
    expect(clientToLogical({ x: 1120, y: 615 }, rect, 1.25)).toEqual({ x: 816, y: 452 });
  });

  it("never returns NaN or Infinity", () => {
    const point = clientToLogical({ x: 200, y: 300 }, rect, 0);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe("snapToGrid", () => {
  it("snaps values to the 8px grid", () => {
    expect(snapToGrid(13)).toBe(16);
    expect(snapToGrid(12)).toBe(16);
    expect(snapToGrid(-3)).toBe(-0);
  });
});

describe("clampRecoverableLayout", () => {
  function layout(overrides: Partial<WidgetLayoutV3>): WidgetLayoutV3 {
    return {
      x: 64,
      y: 64,
      w: 200,
      h: 100,
      zIndex: 0,
      aspectLocked: true,
      ...overrides,
    };
  }

  it("keeps at least 32 recoverable pixels visible after an extreme move", () => {
    const clamped = clampRecoverableLayout(layout({ x: -500, y: 64 }));
    expect(clamped.x + clamped.w).toBeGreaterThanOrEqual(32);
    expect(clamped.x).toBeLessThanOrEqual(CANVAS_WIDTH - 32);
    expect(clamped.y + clamped.h).toBeGreaterThanOrEqual(32);
    expect(clamped.y).toBeLessThanOrEqual(CANVAS_HEIGHT - 32);
  });

  it("allows negative positions when part of the widget remains recoverable", () => {
    const clamped = clampRecoverableLayout(layout({ x: -120, y: -40 }));
    expect(clamped.x).toBeLessThan(0);
    expect(clamped.y).toBeLessThan(0);
    expect(clamped.x + clamped.w).toBeGreaterThanOrEqual(32);
    expect(clamped.y + clamped.h).toBeGreaterThanOrEqual(32);
  });

  it("never returns NaN or Infinity", () => {
    const clamped = clampRecoverableLayout(layout({ x: Number.NaN, y: Number.POSITIVE_INFINITY, w: 0, h: -4 }));
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(Number.isFinite(clamped.y)).toBe(true);
    expect(Number.isFinite(clamped.w)).toBe(true);
    expect(Number.isFinite(clamped.h)).toBe(true);
    expect(clamped.w).toBeGreaterThanOrEqual(1);
    expect(clamped.h).toBeGreaterThanOrEqual(1);
  });
});