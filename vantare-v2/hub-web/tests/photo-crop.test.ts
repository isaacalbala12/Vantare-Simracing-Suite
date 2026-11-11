import { expect, it } from "vitest";
import { pilotEditorLimits } from "../src/contract/generated/contract";
import {
  centeredCrop,
  clampCrop,
  cropExtent,
  moveCrop,
  zoomCrop,
} from "../src/renderer/screens/settings/photo-crop";

it.each([
  [800, 400],
  [400, 800],
  [256, 256],
])("starts with the largest centered square for %i x %i", (w, h) => {
  const crop = centeredCrop(w, h);
  const [ew, eh] = cropExtent(crop, w, h);
  expect(ew * w).toBeCloseTo(Math.min(w, h));
  expect(eh * h).toBeCloseTo(Math.min(w, h));
  expect(crop.x + ew / 2).toBeCloseTo(0.5);
  expect(crop.y + eh / 2).toBeCloseTo(0.5);
});
it.each([
  [800, 400],
  [400, 800],
])("keeps dragged or zoomed crops inside %i x %i", (w, h) => {
  const original = centeredCrop(w, h),
    zoomed = zoomCrop(original, 2, w, h);
  const [ew, eh] = cropExtent(zoomed, w, h);
  expect(zoomed.x + ew / 2).toBeCloseTo(0.5);
  expect(zoomed.y + eh / 2).toBeCloseTo(0.5);
  expect(moveCrop(zoomed, -10, -10, w, h)).toMatchObject({ x: 0, y: 0 });
  const far = moveCrop(zoomed, 10, 10, w, h);
  expect(far.x + ew).toBeCloseTo(1);
  expect(far.y + eh).toBeCloseTo(1);
  expect(zoomCrop(original, 100, w, h).side).toBe(
    pilotEditorLimits.cropMinSide,
  );
  expect(zoomCrop(zoomed, 0.01, w, h).side).toBe(1);
});
it("rejects invalid dimensions and normalizes malformed crop values", () => {
  expect(() => centeredCrop(0, 100)).toThrow();
  expect(() => clampCrop({ x: 0, y: 0, side: 1 }, NaN, 10)).toThrow();
  expect(clampCrop({ x: NaN, y: Infinity, side: NaN }, 100, 100)).toEqual({
    x: 0,
    y: 0,
    side: 1,
  });
});
