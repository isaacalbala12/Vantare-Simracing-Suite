import { describe, expect, it } from "vitest";
import { MAX_LAYOUT_VIEWPORT_DIMENSION } from "./layout-viewport";
import {
  mapWidgetFrameToResponsive,
  resolveResponsiveSceneTransform,
} from "./responsive-layout";

describe("resolveResponsiveSceneTransform", () => {
  it("returns the identity transform on the 16:9 design base", () => {
    expect(resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it("scales a 16:9 output by height only", () => {
    expect(resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toEqual({
      scale: 2 / 3,
      offsetX: 0,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it("scales 4K 16:9 to exactly 2x", () => {
    expect(resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 3840, height: 2160 })).toEqual({
      scale: 2,
      offsetX: 0,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it("scales QHD by height without widening the 16:9 layout", () => {
    expect(resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 2560, height: 1440 })).toEqual({
      scale: 4 / 3,
      offsetX: 0,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it("fills the 21:9 frame on a 3440x1440 output with a small centering gutter", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 3440, height: 1440 });

    expect(transform).toEqual({
      scale: 4 / 3,
      offsetX: 40,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 2520,
      layoutHeight: 1080,
    });
    expect(transform.layoutWidth * transform.scale).toBe(3360);
  });

  it("keeps the 21:9 frame centered on a 32:9 output", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 5120, height: 1440 });

    expect(transform).toEqual({
      scale: 4 / 3,
      offsetX: 880,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 2520,
      layoutHeight: 1080,
    });
    expect(transform.layoutWidth * transform.scale).toBe(3360);
  });

  it("keeps the 21:9 frame centered on 32:9 4K", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 7680, height: 2160 });

    expect(transform).toEqual({
      scale: 2,
      offsetX: 1320,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 2520,
      layoutHeight: 1080,
    });
    expect(transform.layoutWidth * transform.scale).toBe(5040);
  });

  it("scales a 21:9-low output without widening beyond the frame", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 2560, height: 1080 });

    expect(transform).toEqual({
      scale: 1,
      offsetX: 20,
      offsetY: 0,
      designWidth: 1920,
      layoutWidth: 2520,
      layoutHeight: 1080,
    });
    expect(transform.layoutWidth * transform.scale).toBe(2520);
  });

  it("respects a custom document layout as the design base", () => {
    expect(resolveResponsiveSceneTransform({ width: 3440, height: 1440 }, { width: 3440, height: 1440 })).toEqual({
      scale: 1,
      offsetX: 40,
      offsetY: 0,
      designWidth: 3440,
      layoutWidth: 3360,
      layoutHeight: 1440,
    });
  });

  it.each([
    ["zero layout", { width: 0, height: 1080 }, { width: 1920, height: 1080 }],
    ["non-finite layout", { width: Number.POSITIVE_INFINITY, height: 1080 }, { width: 1920, height: 1080 }],
    ["layout outside the safe contract", { width: MAX_LAYOUT_VIEWPORT_DIMENSION + 1, height: 1080 }, { width: 1920, height: 1080 }],
    ["zero output", { width: 1920, height: 1080 }, { width: 0, height: 1080 }],
    ["non-finite output", { width: 1920, height: 1080 }, { width: 1920, height: Number.NaN }],
    ["output outside the safe contract", { width: 1920, height: 1080 }, { width: MAX_LAYOUT_VIEWPORT_DIMENSION + 1, height: 1080 }],
  ])("rejects %s dimensions", (_label, layoutViewport, outputViewport) => {
    expect(() => resolveResponsiveSceneTransform(layoutViewport, outputViewport)).toThrow(RangeError);
  });
});

describe("mapWidgetFrameToResponsive", () => {
  const identity = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    designWidth: 1920,
    layoutWidth: 1920,
    layoutHeight: 1080,
  };

  it("keeps widget frames unchanged on the 16:9 identity transform", () => {
    expect(mapWidgetFrameToResponsive({ x: 100, y: 50, w: 400, h: 80 }, identity)).toEqual({
      x: 100,
      y: 50,
      w: 400,
      h: 80,
    });
  });

  it("repositions widgets proportionally across the widened layout keeping their size", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 3440, height: 1440 });
    const frame = mapWidgetFrameToResponsive({ x: 1500, y: 40, w: 320, h: 90 }, transform);

    expect(frame).toEqual({
      x: 1500 * (2520 / 1920),
      y: 40,
      w: 320,
      h: 90,
    });
  });

  it("anchors a right-edge widget to the right edge of the widened layout", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 5120, height: 1440 });
    const frame = mapWidgetFrameToResponsive({ x: 1900, y: 0, w: 20, h: 20 }, transform);

    expect(frame).toEqual({ x: 2520 - 20, y: 0, w: 20, h: 20 });
  });

  it("stretches a full-width widget to the widened layout width", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 3440, height: 1440 });
    const frame = mapWidgetFrameToResponsive({ x: 0, y: 0, w: 1920, h: 71 }, transform);

    expect(frame).toEqual({ x: 0, y: 0, w: 2520, h: 71 });
  });

  it("does not stretch widgets narrower than the full layout width", () => {
    const transform = resolveResponsiveSceneTransform({ width: 1920, height: 1080 }, { width: 5120, height: 1440 });
    const frame = mapWidgetFrameToResponsive({ x: 0, y: 0, w: 1900, h: 100 }, transform);

    expect(frame.w).toBe(1900);
    expect(frame.x).toBe(0);
  });

  it("maps widgets into a custom document layout base", () => {
    const transform = resolveResponsiveSceneTransform({ width: 3440, height: 1440 }, { width: 3440, height: 1440 });
    const frame = mapWidgetFrameToResponsive({ x: 100, y: 50, w: 3440, h: 60 }, transform);

    expect(frame).toEqual({ x: 0, y: 50, w: 3360, h: 60 });
  });
});
