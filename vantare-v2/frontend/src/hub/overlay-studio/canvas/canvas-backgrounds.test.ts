import { describe, expect, it } from "vitest";
import {
  CANVAS_BACKGROUNDS,
  resolveCanvasBackground,
  safeAreaInsets,
  SAFE_AREA_INSET_RATIO,
} from "./canvas-backgrounds";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./canvas-geometry";

describe("CANVAS_BACKGROUNDS", () => {
  it("registers local css backgrounds without remote URLs", () => {
    expect(CANVAS_BACKGROUNDS.map((entry) => entry.id)).toEqual(["grid", "solid-black"]);
    for (const background of CANVAS_BACKGROUNDS) {
      expect(background.kind).toBe("css");
      expect(background.className.startsWith("osv3-bg-")).toBe(true);
      expect(JSON.stringify(background).includes("http")).toBe(false);
    }
  });
});

describe("safeAreaInsets", () => {
  it("uses a five percent inset on every side", () => {
    const insets = safeAreaInsets(CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(insets.top).toBe(Math.round(CANVAS_HEIGHT * SAFE_AREA_INSET_RATIO));
    expect(insets.right).toBe(Math.round(CANVAS_WIDTH * SAFE_AREA_INSET_RATIO));
    expect(insets.bottom).toBe(Math.round(CANVAS_HEIGHT * SAFE_AREA_INSET_RATIO));
    expect(insets.left).toBe(Math.round(CANVAS_WIDTH * SAFE_AREA_INSET_RATIO));
  });
});

describe("resolveCanvasBackground", () => {
  it("falls back to grid for unknown ids", () => {
    expect(resolveCanvasBackground("unknown").id).toBe("grid");
  });
});