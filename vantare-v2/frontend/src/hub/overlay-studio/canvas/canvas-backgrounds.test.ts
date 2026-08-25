import { describe, expect, it } from "vitest";
import {
  CANVAS_BACKGROUNDS,
  resolveCanvasBackground,
  resolveStageBackground,
  safeAreaInsets,
  SAFE_AREA_INSET_RATIO,
  WALLPAPER_CLASS_NAME,
} from "./canvas-backgrounds";
import { wallpaperBackgroundId, type StudioWallpaper } from "./studio-wallpapers";

describe("CANVAS_BACKGROUNDS", () => {
  it("registers local css backgrounds without remote URLs", () => {
    expect(CANVAS_BACKGROUNDS.map((entry) => entry.id)).toEqual(["grid", "gradient", "solid-black"]);
    for (const background of CANVAS_BACKGROUNDS) {
      expect(background.kind).toBe("css");
      expect(background.className.startsWith("osv3-bg-")).toBe(true);
      expect(JSON.stringify(background).includes("http")).toBe(false);
      // labelKey existia sin traducciones y sin usarse, asi que el selector
      // mostraba identificadores en crudo.
      expect(background.labelKey.startsWith("studio.v3.canvas.background.")).toBe(true);
    }
  });
});

describe("safeAreaInsets", () => {
  it.each([
    [3440, 1440],
    [5120, 1440],
    [1000, 1000],
  ])("uses a five percent inset on every side of a %d x %d viewport", (width, height) => {
    const insets = safeAreaInsets(width, height);
    expect(insets.top).toBe(Math.round(height * SAFE_AREA_INSET_RATIO));
    expect(insets.right).toBe(Math.round(width * SAFE_AREA_INSET_RATIO));
    expect(insets.bottom).toBe(Math.round(height * SAFE_AREA_INSET_RATIO));
    expect(insets.left).toBe(Math.round(width * SAFE_AREA_INSET_RATIO));
  });
});

describe("resolveCanvasBackground", () => {
  it("falls back to grid for unknown ids", () => {
    expect(resolveCanvasBackground("unknown").id).toBe("grid");
  });
});

describe("resolveStageBackground", () => {
  const wallpaper: StudioWallpaper = {
    id: "grab-3",
    name: "GRAB_003",
    dataUrl: "data:image/jpeg;base64,AAAA",
    width: 1920,
    height: 1080,
    addedAt: 1,
  };

  it("keeps the css class for a factory background", () => {
    expect(resolveStageBackground("solid-black", null)).toEqual({ className: "osv3-bg-black" });
  });

  it("paints a wallpaper as an inline background image", () => {
    const resolved = resolveStageBackground(wallpaperBackgroundId(wallpaper.id), wallpaper);
    expect(resolved.className).toBe(WALLPAPER_CLASS_NAME);
    expect(resolved.style?.backgroundImage).toBe(`url("${wallpaper.dataUrl}")`);
  });

  it("falls back to the grid when the wallpaper is gone", () => {
    const resolved = resolveStageBackground(wallpaperBackgroundId("deleted"), null);
    expect(resolved.className).toBe("osv3-bg-grid");
    expect(resolved.style).toBeUndefined();
  });
});
