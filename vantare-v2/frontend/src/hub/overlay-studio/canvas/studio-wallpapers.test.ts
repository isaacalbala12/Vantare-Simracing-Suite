import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addWallpaper,
  findWallpaper,
  listWallpapers,
  MAX_WALLPAPERS,
  removeWallpaper,
  resetWallpaperCacheForTests,
  subscribeWallpapers,
  wallpaperBackgroundId,
  wallpaperIdOf,
  WallpaperQuotaError,
  type StudioWallpaper,
} from "./studio-wallpapers";

const STORAGE_KEY = "vantare.studio.wallpapers";

function wallpaper(id: string): StudioWallpaper {
  return {
    id,
    name: id,
    dataUrl: "data:image/jpeg;base64,AAAA",
    width: 1920,
    height: 1080,
    addedAt: 1,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetWallpaperCacheForTests();
});

describe("wallpaper background ids", () => {
  it("round-trips an id through the background id", () => {
    expect(wallpaperIdOf(wallpaperBackgroundId("abc"))).toBe("abc");
  });

  it("rejects factory backgrounds and an empty id", () => {
    expect(wallpaperIdOf("grid")).toBeNull();
    expect(wallpaperIdOf("gradient")).toBeNull();
    expect(wallpaperIdOf("wallpaper:")).toBeNull();
  });
});

describe("wallpaper library", () => {
  it("stores the newest wallpaper first and finds it by id", () => {
    addWallpaper(wallpaper("one"));
    addWallpaper(wallpaper("two"));

    expect(listWallpapers().map((entry) => entry.id)).toEqual(["two", "one"]);
    expect(findWallpaper("one")?.id).toBe("one");
    expect(findWallpaper("missing")).toBeNull();
    expect(findWallpaper(null)).toBeNull();
  });

  it("drops the oldest wallpaper past the cap", () => {
    for (let index = 0; index <= MAX_WALLPAPERS; index += 1) {
      addWallpaper(wallpaper(`w${index}`));
    }

    const ids = listWallpapers().map((entry) => entry.id);
    expect(ids).toHaveLength(MAX_WALLPAPERS);
    expect(ids).not.toContain("w0");
    expect(ids[0]).toBe(`w${MAX_WALLPAPERS}`);
  });

  it("survives a reload and a corrupt entry", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([wallpaper("good"), { id: "bad" }, "nonsense"]),
    );
    resetWallpaperCacheForTests();

    expect(listWallpapers().map((entry) => entry.id)).toEqual(["good"]);
  });

  it("ignores unparsable storage instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{roto");
    resetWallpaperCacheForTests();

    expect(listWallpapers()).toEqual([]);
  });

  it("removes a wallpaper and notifies subscribers", () => {
    addWallpaper(wallpaper("one"));
    const listener = vi.fn();
    const unsubscribe = subscribeWallpapers(listener);

    removeWallpaper("one");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listWallpapers()).toEqual([]);

    // Borrar algo que ya no esta no vuelve a escribir ni a notificar.
    removeWallpaper("one");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps a stable snapshot reference between reads", () => {
    addWallpaper(wallpaper("one"));
    expect(listWallpapers()).toBe(listWallpapers());
  });

  it("raises a typed error when storage is full", () => {
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });

    expect(() => addWallpaper(wallpaper("one"))).toThrow(WallpaperQuotaError);
    setItem.mockRestore();
  });
});
