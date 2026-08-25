import { describe, expect, it } from "vitest";
import {
  importWallpaperFile,
  wallpaperName,
  wallpaperTargetSize,
  WallpaperImportError,
  WALLPAPER_MAX_HEIGHT,
  WALLPAPER_MAX_INPUT_BYTES,
  WALLPAPER_MAX_WIDTH,
} from "./wallpaper-import";

describe("wallpaperTargetSize", () => {
  it("shrinks a 1440p capture into the stored box keeping its ratio", () => {
    const size = wallpaperTargetSize(2560, 1440);
    expect(size).toEqual({ width: WALLPAPER_MAX_WIDTH, height: WALLPAPER_MAX_HEIGHT });
  });

  it("shrinks an ultrawide capture by its widest side", () => {
    const size = wallpaperTargetSize(3440, 1440);
    expect(size.width).toBe(WALLPAPER_MAX_WIDTH);
    expect(size.height).toBe(Math.round((1440 * WALLPAPER_MAX_WIDTH) / 3440));
  });

  it("never blows up an image smaller than the box", () => {
    expect(wallpaperTargetSize(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it("returns an empty box for a degenerate size", () => {
    expect(wallpaperTargetSize(0, 1080)).toEqual({ width: 0, height: 0 });
  });
});

describe("wallpaperName", () => {
  it("drops the extension", () => {
    expect(wallpaperName("GRAB_003.JPG")).toBe("GRAB_003");
  });

  it("keeps the raw name when there is nothing left", () => {
    expect(wallpaperName(".gitkeep")).toBe(".gitkeep");
  });

  it("clips a long name so it fits the thumbnail band", () => {
    const name = wallpaperName(`${"x".repeat(60)}.png`);
    expect(name).toHaveLength(32);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("importWallpaperFile", () => {
  it("rejects a file that is not an image", async () => {
    const file = new File(["hola"], "notas.txt", { type: "text/plain" });
    await expect(importWallpaperFile(file)).rejects.toMatchObject({
      name: "WallpaperImportError",
      reason: "type",
    });
  });

  it("rejects an image past the input cap", async () => {
    const file = new File(["x"], "huge.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: WALLPAPER_MAX_INPUT_BYTES + 1 });
    await expect(importWallpaperFile(file)).rejects.toBeInstanceOf(WallpaperImportError);
  });
});
