import { describe, expect, it } from "vitest";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { resizeWidgetLayout } from "./canvas-resize";

function startLayout(): WidgetLayoutV3 {
  return {
    x: 100,
    y: 100,
    w: 200,
    h: 100,
    zIndex: 0,
    aspectLocked: true,
  };
}

const deltaCapabilities = { width: 120, height: 48 };

describe("resizeWidgetLayout", () => {
  it("respects minimum size from widget capabilities", () => {
    const resized = resizeWidgetLayout({
      startLayout: startLayout(),
      handle: "se",
      pointerDelta: { dx: -200, dy: -200 },
      minSize: deltaCapabilities,
      supportsAspectUnlock: false,
    });
    expect(resized.w).toBeGreaterThanOrEqual(deltaCapabilities.width);
    expect(resized.h).toBeGreaterThanOrEqual(deltaCapabilities.height);
  });

  it("preserves aspect ratio for locked corner resize", () => {
    const start = startLayout();
    const resized = resizeWidgetLayout({
      startLayout: start,
      handle: "se",
      pointerDelta: { dx: 100, dy: 40 },
      minSize: deltaCapabilities,
      supportsAspectUnlock: false,
    });
    expect(resized.w / resized.h).toBeCloseTo(start.w / start.h, 5);
    expect(resized.w).toBe(300);
    expect(resized.h).toBe(150);
  });

  it("resizes width and height independently when aspect unlock is allowed", () => {
    const resized = resizeWidgetLayout({
      startLayout: { ...startLayout(), aspectLocked: false },
      handle: "se",
      pointerDelta: { dx: 40, dy: -20 },
      minSize: deltaCapabilities,
      supportsAspectUnlock: true,
    });
    expect(resized.w).toBe(240);
    expect(resized.h).toBe(80);
  });

  it("keeps negative positions when resizing from the west edge", () => {
    const resized = resizeWidgetLayout({
      startLayout: { ...startLayout(), x: 20, w: 200 },
      handle: "w",
      pointerDelta: { dx: -40, dy: 0 },
      minSize: deltaCapabilities,
      supportsAspectUnlock: true,
    });
    expect(resized.x).toBe(-20);
    expect(resized.w).toBe(240);
  });

  it.each(["w", "nw", "sw"] as const)(
    "keeps the east edge anchored when %s reaches minimum width",
    (handle) => {
      const start = { ...startLayout(), aspectLocked: false };
      const resized = resizeWidgetLayout({
        startLayout: start,
        handle,
        pointerDelta: { dx: 180, dy: handle === "nw" ? 80 : 0 },
        minSize: deltaCapabilities,
        supportsAspectUnlock: true,
      });

      expect(resized.x + resized.w).toBe(start.x + start.w);
    },
  );

  it.each(["n", "nw", "ne"] as const)(
    "keeps the south edge anchored when %s reaches minimum height",
    (handle) => {
      const start = { ...startLayout(), aspectLocked: false };
      const resized = resizeWidgetLayout({
        startLayout: start,
        handle,
        pointerDelta: { dx: handle === "nw" ? 180 : 0, dy: 90 },
        minSize: deltaCapabilities,
        supportsAspectUnlock: true,
      });

      expect(resized.y + resized.h).toBe(start.y + start.h);
    },
  );

  it.each(["w", "n"] as const)(
    "keeps the opposite edge anchored for aspect-locked %s resize",
    (handle) => {
      const start = startLayout();
      const resized = resizeWidgetLayout({
        startLayout: start,
        handle,
        pointerDelta: { dx: 37, dy: 19 },
        minSize: deltaCapabilities,
        supportsAspectUnlock: false,
      });

      if (handle === "w") {
        expect(resized.x + resized.w).toBe(start.x + start.w);
      } else {
        expect(resized.y + resized.h).toBe(start.y + start.h);
      }
    },
  );

  it("never returns NaN or Infinity", () => {
    const resized = resizeWidgetLayout({
      startLayout: startLayout(),
      handle: "se",
      pointerDelta: { dx: Number.NaN, dy: Number.POSITIVE_INFINITY },
      minSize: deltaCapabilities,
      supportsAspectUnlock: false,
    });
    expect(Number.isFinite(resized.x)).toBe(true);
    expect(Number.isFinite(resized.y)).toBe(true);
    expect(Number.isFinite(resized.w)).toBe(true);
    expect(Number.isFinite(resized.h)).toBe(true);
  });
});
