import { expect, it } from "vitest";
import type { AnalysisPoint } from "../src/contract/generated/analysis";
import type { Compared } from "../src/renderer/app/AnalysisController";
import {
  biggestChanges,
  comparisonAxis,
  pointAt,
  retainZoom,
  windowPoints,
} from "../src/renderer/app/analysis-comparison";
import { valuesAt } from "../src/renderer/ui/analysis/ComparisonValues";

const point = (
  distance: number,
  value: number,
  segment = 0,
  elapsed: number | null = distance / 10,
): AnalysisPoint => ({ distance, value, segment, elapsed });
function data(points: AnalysisPoint[]): Compared {
  return {
    method: "analysis.compare",
    a: 1,
    b: 2,
    distanceRange: [0, 2000],
    speed: {
      a: points,
      b: points.map((p) => ({
        ...p,
        elapsed: p.elapsed === null ? null : p.elapsed * 2,
      })),
    },
    throttle: { a: points, b: points },
    brake: { a: points, b: points },
    delta: points,
    gaps: { a: [], b: [] },
  };
}
it("interpolates only within a drawn segment; never fills a gap, missing elapsed or extrapolated values", () => {
  const points = [
    point(0, 0),
    point(100, 20),
    point(200, 40, 1),
    point(300, 60, 1, null),
    point(400, 80, 1),
  ];
  expect(pointAt(points, 50)?.value).toBe(10);
  expect(pointAt(points, 150)).toBeNull();
  expect(pointAt(points, -1)).toBeNull();
  expect(pointAt(points, 401)).toBeNull();
  expect(pointAt(points, 35, true)).toBeNull();
  expect(windowPoints(points, [50, 150]).map((p) => p.distance)).toEqual([
    50, 100,
  ]);
  expect(windowPoints(points, [140, 160])).toEqual([]);
});
it("uses each series' own elapsed and keeps the delta on elapsed A", () => {
  const view = data([point(0, 0), point(1000, 100), point(2000, 200)]);
  const values = valuesAt(view, 50, true);
  expect(values[0].value).toBe("50 km/h");
  expect(values[1].value).toBe("25 km/h");
  expect(values[6].value).toBe("+50.000 s");
  expect(valuesAt(view, 150, true, [1000, 1250])[0].value).toBe("—");
  expect(comparisonAxis(view, [1000, 1250], true).range).toEqual([100, 250]);
  expect(
    valuesAt({ ...view, delta: null }, 3000).every((v) => v.value === "—"),
  ).toBe(true);
});
it("shades the known elapsed bounds even when the selected window is entirely within a hole", () => {
  const view = data([
    point(0, 0),
    point(500, 1),
    point(1500, 2, 1),
    point(2000, 3, 1),
  ]);
  view.gaps = { a: [{ from: 500, to: 1500 }], b: [] };
  expect(comparisonAxis(view, [750, 1000], false).gaps).toEqual([
    { from: 750, to: 1000 },
  ]);
  expect(comparisonAxis(view, [750, 1000], true)).toMatchObject({
    range: [50, 150],
    gaps: [{ from: 50, to: 150 }],
  });
});
it("ranks three whole 250 m changes and excludes gaps and partial segments", () => {
  const view = data([
    point(0, 0),
    point(250, 0.1),
    point(500, -0.5),
    point(750, -0.3),
    point(1000, 0.6),
    point(1250, 0.8),
    point(1500, 1, 1),
    point(2000, 2, 1),
  ]);
  expect(biggestChanges(view).map((r) => r.from)).toEqual([750, 250, 1500]);
  view.gaps.a = [{ from: 300, to: 400 }];
  expect(biggestChanges(view).some((r) => r.from === 250)).toBe(false);
  expect(biggestChanges({ ...view, delta: null })).toEqual([]);
});
it("bounds the work by the reduced series even with a very long sparse distance range", () => {
  const view = data([point(0, 0), point(1e9, 1)]);
  view.distanceRange = [0, 1e9];
  expect(biggestChanges(view).map((r) => r.from)).toEqual([0, 250, 500]);
  expect(retainZoom([250, 500], [250, 500])).toEqual([250, 500]);
  expect(retainZoom([250, 500], [251, 500])).toBeUndefined();
});
