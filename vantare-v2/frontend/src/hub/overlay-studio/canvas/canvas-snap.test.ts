import { describe, expect, it } from "vitest";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { CANVAS_WIDTH } from "./canvas-geometry";
import { snapWidgetLayout } from "./canvas-snap";

function layout(overrides: Partial<WidgetLayoutV3>): WidgetLayoutV3 {
  return {
    x: 100,
    y: 100,
    w: 200,
    h: 80,
    zIndex: 0,
    aspectLocked: true,
    ...overrides,
  };
}

describe("snapWidgetLayout", () => {
  it("snaps to the 8px grid by default", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: 103, y: 107 }),
      siblings: [],
    });
    expect(result.layout.x).toBe(104);
    expect(result.layout.y).toBe(104);
  });

  it("snaps to canvas edges within tolerance", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: 4, y: 100 }),
      siblings: [],
    });
    expect(result.layout.x).toBe(0);
    expect(result.guides.some((guide) => guide.orientation === "vertical" && guide.position === 0)).toBe(true);
  });

  it("snaps to sibling center guides within tolerance", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: 202, y: 100, w: 200, h: 80 }),
      siblings: [layout({ x: 250, y: 100, w: 100, h: 80 })],
    });
    expect(result.layout.x).toBe(200);
    expect(result.guides.some((guide) => guide.kind === "center" && guide.position === 300)).toBe(true);
  });

  it("snaps the right edge to the canvas boundary", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: CANVAS_WIDTH - 204, y: 100, w: 200, h: 80 }),
      siblings: [],
    });
    expect(result.layout.x + result.layout.w).toBe(CANVAS_WIDTH);
  });

  it("disables all snapping when Alt is held", () => {
    const inputLayout = layout({ x: 103, y: 107 });
    const result = snapWidgetLayout({
      layout: inputLayout,
      siblings: [layout({ x: 200, y: 100, w: 200, h: 80 })],
      disableSnap: true,
    });
    expect(result.layout).toEqual(inputLayout);
    expect(result.guides).toEqual([]);
  });

  it("never returns NaN or Infinity", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: Number.NaN, y: 100 }),
      siblings: [],
    });
    expect(Number.isFinite(result.layout.x)).toBe(true);
    expect(Number.isFinite(result.layout.y)).toBe(true);
  });
});