import { expect, it } from "vitest";
import { effectiveZoom, windowZoomLimit, zoomStep } from "../src/window-zoom";

// The same physical-size/DPI cases as gpui_windows/events.rs. Electron's
// getContentSize is already in DIP, so remove the OS scale before the policy.
it.each([
  [1280, 720, 1, 100, 100],
  [1280, 720, 1, 125, 100],
  [1280, 720, 1, 90, 90],
  [1600, 900, 1.25, 100, 100],
  [1600, 900, 1.25, 125, 100],
  [1920, 1080, 1, 125, 125],
  [1440, 900, 1, 125, 112.5],
  [800, 600, 1, 100, 90],
])(
  "limits physical %dx%d at DPI scale %f, request %d",
  (width, height, dpi, requested, expected) => {
    expect(effectiveZoom(requested, width / dpi, height / dpi)).toBeCloseTo(
      expected,
    );
  },
);
it("shrinks and restores the effective zoom without replacing the saved preference", () => {
  const requested = 125;
  expect(effectiveZoom(requested, 1920, 1080)).toBe(125);
  expect(effectiveZoom(requested, 1280, 720)).toBe(100);
  expect(effectiveZoom(requested, 1920, 1080)).toBe(125);
});
it.each([
  [90, -1, 125, 90],
  [125, 1, 125, 125],
  [100, 1, 125, 110],
  [110, -1, 125, 100],
  [125, 0, 125, 100],
  [110, 1, 112.5, 110],
  [125, 1, 112.5, 125],
  [125, -1, 112.5, 110],
  [90, 1, 90, 90],
] as const)(
  "matches GPUI zoom step %d/%d with limit %f",
  (value, direction, limit, expected) => {
    expect(zoomStep(value, direction, limit)).toBe(expected);
  },
);
it("derives the ceiling from both dimensions", () => {
  expect(windowZoomLimit(1920, 720)).toBe(100);
  expect(windowZoomLimit(1280, 1080)).toBe(100);
});
it("accepts sub-thousandth rounding at the ceiling but not a genuinely unreachable level", () => {
  expect(zoomStep(100, 1, 109.9995)).toBe(110);
  expect(zoomStep(100, 1, 109.998)).toBe(100);
});
