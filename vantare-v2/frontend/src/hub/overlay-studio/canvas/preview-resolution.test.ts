import { describe, expect, it } from "vitest";
import { resolveStudioPreviewSize } from "./preview-resolution";

describe("resolveStudioPreviewSize", () => {
  it("uses the detected viewport in automatic mode", () => {
    expect(resolveStudioPreviewSize("auto", { width: 2560, height: 1440 })).toEqual({
      width: 2560,
      height: 1440,
    });
  });

  it("resolves common ultrawide targets", () => {
    expect(resolveStudioPreviewSize("3440x1440", { width: 1280, height: 720 })).toEqual({
      width: 3440,
      height: 1440,
    });
    expect(resolveStudioPreviewSize("5120x1440", { width: 1280, height: 720 })).toEqual({
      width: 5120,
      height: 1440,
    });
  });
});
