import { describe, expect, it } from "vitest";
import {
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

  it("maps points forward and back through the resolved transform", () => {
    const transform = resolveLayoutViewportTransform(
      { width: 1920, height: 1080 },
      { width: 3440, height: 1440 },
    );
    const outputPoint = mapLayoutPointToOutput({ x: 300, y: 150 }, transform);

    expect(outputPoint).toEqual({ x: 840, y: 200 });
    expect(mapOutputPointToLayout(outputPoint, transform)).toEqual({ x: 300, y: 150 });
  });
});
