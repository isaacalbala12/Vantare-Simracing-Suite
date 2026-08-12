import { describe, expect, it } from "vitest";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  mapLayoutPointToOutput,
  mapOutputPointToLayout,
  resolveLayoutViewportTransform,
} from "./layout-viewport";

describe("resolveLayoutViewportTransform", () => {
  it("returns the identity transform when layout and output match", () => {
    expect(resolveLayoutViewportTransform({ width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("scales a 16:9 layout uniformly", () => {
    expect(resolveLayoutViewportTransform({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toEqual({
      scale: 2 / 3,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("centers an ultrawide output without stretching the layout", () => {
    expect(resolveLayoutViewportTransform({ width: 1920, height: 1080 }, { width: 3440, height: 1440 })).toEqual({
      scale: 4 / 3,
      offsetX: 440,
      offsetY: 0,
    });
  });

  it("supports a custom non-preset layout and output size", () => {
    expect(resolveLayoutViewportTransform({ width: 1000, height: 1000 }, { width: 1200, height: 800 })).toEqual({
      scale: 0.8,
      offsetX: 200,
      offsetY: 0,
    });
  });

  it("centers a landscape layout vertically in a portrait output", () => {
    expect(resolveLayoutViewportTransform({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toEqual({
      scale: 0.5625,
      offsetX: 0,
      offsetY: 656.25,
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
    expect(() => resolveLayoutViewportTransform(layoutViewport, outputViewport)).toThrow(RangeError);
  });

  it("maps points forward and back through the resolved transform", () => {
    const transform = resolveLayoutViewportTransform(
      { width: 1920, height: 1080 },
      { width: 3440, height: 1440 },
    );
    const outputPoint = mapLayoutPointToOutput({ x: 300, y: 150 }, transform);

    expect(outputPoint).toEqual({ x: 840, y: 200 });
    expect(mapOutputPointToLayout(outputPoint, transform)).toEqual({ x: 300, y: 150 });
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects a non-invertible scale %s",
    (scale) => {
      expect(() =>
        mapOutputPointToLayout(
          { x: 100, y: 50 },
          { scale, offsetX: 0, offsetY: 0 },
        ),
      ).toThrow(RangeError);
    },
  );
});
