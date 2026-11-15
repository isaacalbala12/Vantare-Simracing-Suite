import { expect, it } from "vitest";
import {
  studioGeometryCases as cases,
  studioGeometryLimits as limits,
} from "../src/contract/generated/studio";
import {
  anchor,
  fitCanvas,
  freeSpot,
  heldNudgeDistance,
  nudge,
  previewOrigin,
  resize,
  snap,
} from "../src/renderer/screens/studio/geometry";

// These are the committed Rust serialization, not a second hand-maintained fixture.
// Floating coordinates use only Rust's exported absolute epsilon, without rounding.
// Nulls, structure, family coverage and integer keyboard distances remain exact.
// This includes 84.00000000000006 and the two extreme-aspect resize vectors.
it("covers every family exported by Rust", () => {
  expect(Object.keys(cases).sort()).toEqual(
    [
      "snap",
      "resize",
      "anchor",
      "nudge",
      "heldNudge",
      "fit",
      "previewOrigin",
      "freeSpot",
    ].sort(),
  );
});

it("batches canonical nudge steps without rounding fractional coordinates", () => {
  expect(nudge([0.25, -0.5], [1, 0], false)).toEqual([1.25, -0.5]);
  expect(nudge([0.25, -0.5], [0, -1], true, 3)).toEqual([0.25, -24.5]);
  expect(nudge([limits.nudgeLimit - 0.25, 0], [1, 0], true, 100000)).toEqual([
    limits.nudgeLimit,
    0,
  ]);
  for (const count of [NaN, Infinity, -1, 1.5])
    expect(nudge([0, 0], [1, 0], false, count)).toBeNull();
});
it.each(cases.snap)("matches Rust snap vector %#", (c) =>
  expectVector(
    snap(c.center, c.size, c.canvas, c.others, c.threshold),
    c.expected,
  ),
);
it.each(cases.resize)("matches Rust resize/handle vector %#", (c) =>
  expectVector(
    resize(c.start, c.size, c.handle, c.delta, c.locked),
    c.expected,
  ),
);
it.each(cases.anchor)("matches Rust anchor vector %#", (c) =>
  expectVector(anchor(c.size, c.canvas, c.column, c.row), c.expected),
);
it.each(cases.nudge)("matches Rust nudge vector %#", (c) =>
  expectVector(nudge(c.position, c.direction, c.shift), c.expected),
);
it.each(cases.heldNudge)("matches Rust held keyboard vector %#", (c) =>
  expect(heldNudgeDistance(c.elapsedMs, c.shift)).toBe(c.expected),
);
it.each(cases.fit)("matches Rust fit vector %#", (c) =>
  expectVector(fitCanvas(c.viewport, c.canvas), c.expected),
);
it.each(cases.previewOrigin)("matches Rust origin vector %#", (c) =>
  expectVector(previewOrigin(c.viewport, c.canvas, c.scale), c.expected),
);
it.each(cases.freeSpot)("matches Rust free position vector %#", (c) =>
  expectVector(freeSpot(c.canvas, c.size, c.taken), c.expected),
);
it("rejects invalid geometry instead of drawing non-finite CSS", () => {
  expect(snap([NaN, 0], [100, 100], [1920, 1080], [], 7)).toBeNull();
  expect(resize([0, 0], [100, 100], [0, 0], [10, 10], false)).toBeNull();
  expect(anchor([100, 100], [1920, 1080], 3, 0)).toBeNull();
  expect(fitCanvas([0, 0], [1920, 1080])).toBeNull();
  expect(previewOrigin([100, 100], [1920, 1080], Infinity)).toBeNull();
});

function expectVector(actual: unknown, expected: unknown) {
  if (typeof expected === "number") {
    if (typeof actual !== "number")
      throw Error("Expected a numeric coordinate");
    expect(Number.isFinite(actual)).toBe(true);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(limits.epsilon);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) throw Error("Expected a coordinate tuple");
    expect(actual.length).toBe(expected.length);
    expected.forEach((value, i) => {
      expectVector(actual[i], value);
    });
  } else if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual))
      throw Error("Expected geometry object");
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected))
      expectVector((actual as Record<string, unknown>)[key], value);
  } else expect(actual).toBe(expected);
}
it("does not round coordinates or accept errors beyond Rust epsilon", () => {
  expectVector(84.00000000000006, 84);
  expect(() => expectVector(84 + limits.epsilon * 2, 84)).toThrow();
  expect(() => expectVector(null, 84)).toThrow();
  expect(() => expectVector([84, 0], [84])).toThrow();
});
