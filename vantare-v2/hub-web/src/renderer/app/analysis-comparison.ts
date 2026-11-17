import type { AnalysisLap } from "../../contract/generated/analysis";
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
