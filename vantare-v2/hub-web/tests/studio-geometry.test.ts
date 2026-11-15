import { expect, it } from "vitest";
import { studioGeometryCases as cases } from "../src/contract/generated/studio";
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
it.each(cases.snap)("matches Rust snap vector %#", (c) =>
  expect(snap(c.center, c.size, c.canvas, c.others, c.threshold)).toEqual(
    c.expected,
  ),
);
it.each(cases.resize)("matches Rust resize/handle vector %#", (c) =>
  expect(resize(c.start, c.size, c.handle, c.delta, c.locked)).toEqual(
    c.expected,
  ),
);
it.each(cases.anchor)("matches Rust anchor vector %#", (c) =>
  expect(anchor(c.size, c.canvas, c.column, c.row)).toEqual(c.expected),
);
it.each(cases.nudge)("matches Rust nudge vector %#", (c) =>
  expect(nudge(c.position, c.direction, c.shift)).toEqual(c.expected),
);
it.each(cases.heldNudge)("matches Rust held keyboard vector %#", (c) =>
  expect(heldNudgeDistance(c.elapsedMs, c.shift)).toBe(c.expected),
);
it.each(cases.fit)("matches Rust fit vector %#", (c) =>
  expect(fitCanvas(c.viewport, c.canvas)).toBe(c.expected),
);
it.each(cases.previewOrigin)("matches Rust origin vector %#", (c) =>
  expect(previewOrigin(c.viewport, c.canvas, c.scale)).toEqual(c.expected),
);
it.each(cases.freeSpot)("matches Rust free position vector %#", (c) =>
  expect(freeSpot(c.canvas, c.size, c.taken)).toEqual(c.expected),
);
it("rejects invalid geometry instead of drawing non-finite CSS", () => {
  expect(snap([NaN, 0], [100, 100], [1920, 1080], [], 7)).toBeNull();
  expect(resize([0, 0], [100, 100], [0, 0], [10, 10], false)).toBeNull();
  expect(anchor([100, 100], [1920, 1080], 3, 0)).toBeNull();
  expect(fitCanvas([0, 0], [1920, 1080])).toBeNull();
  expect(previewOrigin([100, 100], [1920, 1080], Infinity)).toBeNull();
});
