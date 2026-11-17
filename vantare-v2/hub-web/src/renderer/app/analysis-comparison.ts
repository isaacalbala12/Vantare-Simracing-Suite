import type {
  AnalysisLap,
  AnalysisPoint,
} from "../../contract/generated/analysis";
import type { Compared } from "./AnalysisController";
import { validLapTime } from "./analysis-laps";
export type Pair = { a?: number; b?: number };
export const comparable = (lap: AnalysisLap) =>
  lap.sealed && (validLapTime(lap) !== null || lap.gap);
export const timedLaps = (laps: AnalysisLap[]) =>
  laps
    .filter((lap) => validLapTime(lap) !== null)
    .sort((a, b) => (validLapTime(a) ?? 0) - (validLapTime(b) ?? 0));
export function initialPair(laps: AnalysisLap[]): Pair {
  const timed = timedLaps(laps);
  return {
    a: laps
      .filter(
        (lap) => validLapTime(lap) !== null && lap.index !== timed[0]?.index,
      )
      .at(-1)?.index,
    b: timed.length > 1 ? timed[0].index : undefined,
  };
}
export function commonRanges(data: Compared) {
  let ranges = [data.distanceRange];
  for (const gap of [...data.gaps.a, ...data.gaps.b])
    ranges = ranges.flatMap(([from, to]) =>
      gap.to <= from || gap.from >= to
        ? [[from, to] as [number, number]]
        : ([
            [from, Math.max(from, gap.from)],
            [Math.min(to, gap.to), to],
          ].filter(([a, b]) => b > a) as [number, number][]),
    );
  return ranges;
}
export type DistanceWindow = [number, number];
/** Read the drawn segment. Missing time, segment changes and extrapolation return no value. */
export function pointAt(
  points: readonly AnalysisPoint[],
  coordinate: number,
  time = false,
): AnalysisPoint | null {
  let left: AnalysisPoint | undefined;
  for (const right of points) {
    const end = time ? right.elapsed : right.distance;
    if (end === null) {
      left = undefined;
      continue;
    }
    if (end === coordinate) return right;
    if (end > coordinate) {
      const start = left && (time ? left.elapsed : left.distance);
      if (
        !left ||
        start == null ||
        end <= start ||
        left.segment !== right.segment
      )
        return null;
      const f = (coordinate - start) / (end - start);
      return {
        ...left,
        distance: left.distance + f * (right.distance - left.distance),
        value: left.value + f * (right.value - left.value),
        elapsed:
          left.elapsed === null || right.elapsed === null
            ? null
            : left.elapsed + f * (right.elapsed - left.elapsed),
      };
    }
    left = right;
  }
  return null;
}
export function windowPoints(
  points: readonly AnalysisPoint[],
  [from, to]: DistanceWindow,
) {
  const visible = points.filter((p) => p.distance >= from && p.distance <= to);
  const first = pointAt(points, from),
    last = pointAt(points, to);
  if (first && visible[0]?.distance !== from) visible.unshift(first);
  if (last && visible.at(-1)?.distance !== to) visible.push(last);
  return visible;
}
export function retainZoom(
  zoom: DistanceWindow | undefined,
  [from, to]: DistanceWindow,
) {
  return zoom && zoom[0] >= from && zoom[1] <= to ? zoom : undefined;
}
export function projectedGaps(
  data: Compared,
  window: DistanceWindow,
  time: boolean,
) {
  const ranges = (["a", "b"] as const)
    .flatMap((side) => {
      const known = [data.speed, data.throttle, data.brake]
        .flatMap((s) => s[side])
        .filter((p) => p.elapsed !== null)
        .sort((a, b) => a.distance - b.distance);
      return data.gaps[side].flatMap((gap) => {
        if (gap.to <= window[0] || gap.from >= window[1]) return [];
        const from = time
          ? known.findLast((p) => p.distance <= gap.from)?.elapsed
          : Math.max(window[0], gap.from);
        const to = time
          ? known.find((p) => p.distance >= gap.to)?.elapsed
          : Math.min(window[1], gap.to);
        return from == null || to == null ? [] : [{ from, to }];
      });
    })
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}
export function comparisonAxis(
  data: Compared,
  distance: DistanceWindow,
  time: boolean,
) {
  const gaps = projectedGaps(data, distance, time);
  const elapsed = [data.speed, data.throttle, data.brake]
    .flatMap((s) => [s.a, s.b])
    .flatMap((points) => windowPoints(points, distance))
    .flatMap((p) => (p.elapsed === null ? [] : [p.elapsed]));
  if (time) elapsed.push(...gaps.flatMap((g) => [g.from, g.to]));
  const min = elapsed.length ? Math.min(...elapsed) : 0,
    max = elapsed.length ? Math.max(...elapsed) : 1;
  return {
    time,
    distance,
    range: (time
      ? [min, max > min ? max : min + 1]
      : distance) as DistanceWindow,
    gaps,
  };
}
export function biggestChanges(data: Compared) {
  const points = data.delta ?? [];
  const candidates = new Set<number>();
  // Extremes of a 250 m difference lie near its piecewise-linear breakpoints.
  // Seven neighbours also cover the top three ties without a loop over the lap length.
  for (const distance of [
    ...points.map((p) => p.distance),
    ...data.distanceRange,
  ])
    for (let offset = -3; offset <= 3; offset++)
      candidates.add((Math.floor(distance / 250) + offset) * 250);
  return [...candidates]
    .flatMap((from) => {
      const to = from + 250;
      if (
        to <= from ||
        from < data.distanceRange[0] ||
        to > data.distanceRange[1]
      )
        return [];
      const a = pointAt(points, from),
        b = pointAt(points, to);
      if (
        !a ||
        !b ||
        a.segment !== b.segment ||
        points.some(
          (p) =>
            p.distance > from && p.distance < to && p.segment !== a.segment,
        ) ||
        [...data.gaps.a, ...data.gaps.b].some((g) => g.to > from && g.from < to)
      )
        return [];
      return [{ from, to, delta: b.value - a.value }];
    })
    .sort((a, b) =>
      Math.abs(Math.abs(b.delta) - Math.abs(a.delta)) < 1e-9
        ? a.from - b.from
        : Math.abs(b.delta) - Math.abs(a.delta),
    )
    .slice(0, 3);
}
