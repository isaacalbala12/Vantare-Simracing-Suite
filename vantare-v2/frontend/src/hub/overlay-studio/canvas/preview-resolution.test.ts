import { describe, expect, it } from "vitest";
import {
  findLayoutViewportPreset,
  getLayoutViewportPreset,
  LAYOUT_VIEWPORT_PRESETS,
} from "./preview-resolution";

describe("layout viewport presets", () => {
  it("keeps common surfaces as flat document shortcuts", () => {
    expect(LAYOUT_VIEWPORT_PRESETS.map((preset) => preset.id)).toEqual([
      "1280x720",
      "1920x1080",
      "2560x1440",
      "3840x2160",
      "2560x1080",
      "3440x1440",
      "5120x2160",
      "3840x1080",
      "5120x1440",
    ]);
    expect(getLayoutViewportPreset("5120x1440")).toMatchObject({
      width: 5120,
      height: 1440,
    });
  });

  it("matches a preset only when both document dimensions match", () => {
    expect(findLayoutViewportPreset({ width: 3440, height: 1440 })?.id).toBe("3440x1440");
    expect(findLayoutViewportPreset({ width: 1000, height: 1000 })).toBeUndefined();
    expect(getLayoutViewportPreset("custom")).toBeUndefined();
  });
});
