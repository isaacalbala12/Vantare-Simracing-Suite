import { describe, expect, it } from "vitest";
import { resolveHubZoomFactor } from "./hub-zoom";

describe("resolveHubZoomFactor", () => {
  it("is 1 on the 1080p design base", () => {
    expect(resolveHubZoomFactor(1080)).toBe(1);
  });

  it("scales QHD to 4/3", () => {
    expect(resolveHubZoomFactor(1440)).toBeCloseTo(4 / 3);
  });

  it("scales 4K and 32:9 4K to 2", () => {
    expect(resolveHubZoomFactor(2160)).toBe(2);
  });

  it("never goes below 1 on short windows", () => {
    expect(resolveHubZoomFactor(600)).toBe(1);
    expect(resolveHubZoomFactor(720)).toBe(1);
  });

  it("caps the factor at 2.5 on very tall windows", () => {
    expect(resolveHubZoomFactor(3240)).toBe(2.5);
    expect(resolveHubZoomFactor(4320)).toBe(2.5);
  });
});
