import type { AnalysisLap } from "../../contract/generated/analysis";
export const validLapTime = (lap: AnalysisLap) =>
  lap.sealed && !lap.gap ? lap.lapTimeApproxMs : null;
export const lapDataKind = (lap: AnalysisLap) =>
  !lap.sealed
    ? "unsealed"
    : lap.gap
      ? "gap"
      : lap.lapTimeApproxMs === null
        ? "incomplete"
        : "complete";
export const estimatedLap = (lap: AnalysisLap) =>
  [lap.speed, lap.throttle, lap.brake].some(
    (signal) => signal.estimated > 0 || signal.stale > 0,
  );
export function summarizeLaps(laps: readonly AnalysisLap[]) {
  const complete = laps.filter((lap) => validLapTime(lap) !== null);
  const best = complete.reduce<AnalysisLap | undefined>(
    (best, lap) =>
      !best ||
      (validLapTime(lap) ?? Infinity) < (validLapTime(best) ?? Infinity)
        ? lap
        : best,
    undefined,
  );
  const fastest = laps
    .filter((lap) => lap.speed.max !== null)
    .reduce<AnalysisLap | undefined>(
      (best, lap) =>
        !best || (lap.speed.max ?? -Infinity) > (best.speed.max ?? -Infinity)
          ? lap
          : best,
      undefined,
    );
  const gaps = laps.filter((lap) => lap.gap).length;
  return {
    best,
    fastest,
    complete: complete.length,
    gaps,
    withoutTime: laps.length - complete.length - gaps,
    bestTime: best ? validLapTime(best) : null,
    mean: complete.length
      ? complete.reduce((sum, lap) => sum + (validLapTime(lap) ?? 0), 0) /
        complete.length
      : null,
    maxSpeed: fastest?.speed.max == null ? null : fastest.speed.max * 3.6,
  };
}
