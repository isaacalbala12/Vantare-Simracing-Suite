import { expect, it } from "vitest";
import {
  studioGeometryCases as cases,
  studioGeometryLimits,
} from "../src/contract/generated/studio";
import * as geometry from "../src/renderer/screens/studio/geometry";

function equivalent(actual: unknown, expected: unknown) {
  if (typeof expected === "number") {
    expect(typeof actual).toBe("number");
    expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(
      studioGeometryLimits.epsilon,
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    expected.forEach((v, i) => {
      equivalent((actual as unknown[])[i], v);
    });
  } else if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [key, value] of Object.entries(expected))
      equivalent((actual as Record<string, unknown>)[key], value);
  } else expect(actual).toBe(expected);
}
for (const c of cases.snap)
  it(`native snap ${JSON.stringify(c.center)}/${c.threshold}`, () =>
    equivalent(
      geometry.snap(c.center, c.size, c.canvas, c.others, c.threshold),
      c.expected,
    ));
for (const [i, c] of cases.resize.entries())
  it(`native resize ${i}`, () =>
    equivalent(
      geometry.resize(c.start, c.size, c.handle, c.delta, c.locked),
      c.expected,
    ));
for (const c of cases.anchor)
  it(`native anchor ${c.column}/${c.row}`, () =>
    equivalent(geometry.anchor(c.size, c.canvas, c.column, c.row), c.expected));
for (const c of cases.nudge)
  it(`native nudge ${JSON.stringify(c)}`, () =>
    equivalent(geometry.nudge(c.position, c.direction, c.shift), c.expected));
for (const c of cases.heldNudge)
  it(`native held nudge ${c.elapsedMs}/${c.shift}`, () =>
    equivalent(geometry.heldNudgeDistance(c.elapsedMs, c.shift), c.expected));
for (const c of cases.fit)
  it("native fit", () =>
    equivalent(geometry.fit(c.viewport, c.canvas), c.expected));
for (const c of cases.previewOrigin)
  it("native preview origin", () =>
    equivalent(
      geometry.previewOrigin(c.viewport, c.canvas, c.scale),
      c.expected,
    ));
for (const [i, c] of cases.freeSpot.entries())
  it(`native free spot ${i}`, () =>
    equivalent(geometry.freeSpot(c.canvas, c.size, c.taken), c.expected));
it("rejects non-finite inputs and invalid handles", () => {
  expect(geometry.resize([0, 0], [100, 100], [0, 0], [1, 1], true)).toBeNull();
  expect(
    geometry.snap([Infinity, 0], [100, 100], [1920, 1080], [], 7),
  ).toBeNull();
  expect(
    geometry.resize([0, 0], [100, 100], [1, 1], [NaN, 1], true),
  ).toBeNull();
  expect(geometry.anchor([100, 100], [0, 1080], 1, 1)).toBeNull();
  expect(geometry.nudge([0, 0], [2, 0], false)).toBeNull();
});
