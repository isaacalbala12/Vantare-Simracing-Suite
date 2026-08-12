import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_VIEWPORT,
  type LayoutViewport,
} from "../../../overlay/core/layout-viewport";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { snapPoint, snapWidgetLayout } from "./canvas-snap";

const DEFAULT_VIEWPORT = DEFAULT_LAYOUT_VIEWPORT;

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
      layoutViewport: DEFAULT_VIEWPORT,
    });
    expect(result.layout.x).toBe(104);
    expect(result.layout.y).toBe(104);
  });

  it("snaps to canvas edges within tolerance", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: 4, y: 100 }),
      siblings: [],
      layoutViewport: { width: 1280, height: 720 },
    });
    expect(result.layout.x).toBe(0);
    expect(result.guides.some((guide) => guide.orientation === "vertical" && guide.position === 0)).toBe(true);
  });

  it("snaps to sibling center guides within tolerance", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: 202, y: 100, w: 200, h: 80 }),
      siblings: [layout({ x: 250, y: 100, w: 100, h: 80 })],
      layoutViewport: DEFAULT_VIEWPORT,
    });
    expect(result.layout.x).toBe(200);
    expect(result.guides.some((guide) => guide.kind === "center" && guide.position === 300)).toBe(true);
  });

  it("snaps the right edge to the canvas boundary", () => {
    const layoutViewport = { width: 3440, height: 1440 };
    const result = snapWidgetLayout({
      layout: layout({ x: layoutViewport.width - 204, y: 100, w: 200, h: 80 }),
      siblings: [],
      layoutViewport,
    });
    expect(result.layout.x + result.layout.w).toBe(layoutViewport.width);
    expect(result.guides).toContainEqual({
      orientation: "vertical",
      position: layoutViewport.width,
      kind: "edge",
    });
  });

  it.each([
    { width: 5120, height: 1440 },
    { width: 1000, height: 1000 },
  ] satisfies LayoutViewport[])("snaps to the center of a $width x $height viewport", (layoutViewport) => {
    const result = snapWidgetLayout({
      layout: layout({
        x: (layoutViewport.width - 200) / 2 + 2,
        y: (layoutViewport.height - 80) / 2 - 2,
      }),
      siblings: [],
      layoutViewport,
    });
    expect(result.layout.x).toBe((layoutViewport.width - 200) / 2);
    expect(result.layout.y).toBe((layoutViewport.height - 80) / 2);
    expect(result.guides).toContainEqual({
      orientation: "vertical",
      position: layoutViewport.width / 2,
      kind: "center",
    });
    expect(result.guides).toContainEqual({
      orientation: "horizontal",
      position: layoutViewport.height / 2,
      kind: "center",
    });
  });

  it("propagates the viewport through snapPoint", () => {
    const result = snapPoint(
      { x: 997, y: 997 },
      {
        size: { w: 0, h: 0 },
        siblings: [],
        layoutViewport: { width: 1000, height: 1000 },
      },
    );
    expect(result.layout.x).toBe(1000);
    expect(result.layout.y).toBe(1000);
    expect(result.guides).toContainEqual({ orientation: "vertical", position: 1000, kind: "edge" });
    expect(result.guides).toContainEqual({ orientation: "horizontal", position: 1000, kind: "edge" });
  });

  it("disables all snapping when Alt is held", () => {
    const inputLayout = layout({ x: 103, y: 107 });
    const result = snapWidgetLayout({
      layout: inputLayout,
      siblings: [layout({ x: 200, y: 100, w: 200, h: 80 })],
      disableSnap: true,
      layoutViewport: DEFAULT_VIEWPORT,
    });
    expect(result.layout).toEqual(inputLayout);
    expect(result.guides).toEqual([]);
  });

  it("never returns NaN or Infinity", () => {
    const result = snapWidgetLayout({
      layout: layout({ x: Number.NaN, y: 100 }),
      siblings: [],
      layoutViewport: DEFAULT_VIEWPORT,
    });
    expect(Number.isFinite(result.layout.x)).toBe(true);
    expect(Number.isFinite(result.layout.y)).toBe(true);
  });
});
