import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { studioKinds } from "../src/contract/generated/studio";
import { thumbnailGeometry } from "../src/renderer/ui/studio/Widgets";

describe("widget thumbnail layout", () => {
  it("keeps small overlays at natural size and fits tall overlays", () => {
    expect(thumbnailGeometry("delta", 293, 132)).toEqual({
      width: 150,
      height: 36,
      cropped: false,
    });
    expect(thumbnailGeometry("pedals", 293, 132).width).toBeCloseTo(79.2);
    expect(thumbnailGeometry("pedals", 293, 132)).toMatchObject({
      height: 132,
      cropped: false,
    });
    expect(thumbnailGeometry("standings", 293, 132).height).toBe(132);
  });
  it("keeps narrow bars legible and crops their far end", () => {
    expect(thumbnailGeometry("broadcast-tower", 293, 132)).toMatchObject({
      width: 800,
      height: 32,
      cropped: true,
    });
    expect(thumbnailGeometry("head-to-head", 293, 132).height).toBe(32);
    expect(thumbnailGeometry("broadcast-tower", 124, 60, 20).height).toBe(20);
  });
  it("has a vector fallback for every kind until PNG capture is authorized", () => {
    for (const kind of studioKinds)
      expect(
        existsSync(resolve("src/renderer/assets/widgets", `${kind}.svg`)),
        kind,
      ).toBe(true);
  });
});
