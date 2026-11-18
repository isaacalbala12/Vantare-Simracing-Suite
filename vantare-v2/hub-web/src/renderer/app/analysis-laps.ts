import type {
  AnalysisLap,
  AnalysisSessionSummary,
} from "../../contract/generated/analysis";

export function lapTime(lap: AnalysisLap | undefined): {
  ms: number | null;
  official: boolean;
} {
  if (!lap?.sealed || lap.gap) return { ms: null, official: false };
  if (lap.lapTimeMs !== null) return { ms: lap.lapTimeMs, official: true };
  return { ms: lap.lapTimeApproxMs, official: false };
}

export const validLapTime = (lap: AnalysisLap) => lapTime(lap).ms;

export function groupSessionLaps(
  laps: readonly AnalysisLap[],
  sessions: readonly AnalysisSessionSummary[],
) {
  const groups = sessions.map((session) => ({
    session,
    laps: [] as AnalysisLap[],
  }));
  const unassigned: AnalysisLap[] = [];
  for (const lap of laps) {
    const group = lap.session === null ? undefined : groups[lap.session];
    (group?.laps ?? unassigned).push(lap);
  }
  return [
    ...groups.filter((group) => group.laps.length > 0),
    ...(unassigned.length || !sessions.length
      ? [{ session: undefined, laps: unassigned }]
      : []),
  ];
}
export const lapDataKind = (lap: AnalysisLap) =>
  !lap.sealed
    ? "unsealed"
    : lap.gap
      ? "gap"
      : lapTime(lap).ms === null
        ? "incomplete"
        : "complete";
export const estimatedLap = (lap: AnalysisLap) =>
  [lap.speed, lap.throttle, lap.brake].some(
    (signal) => signal.estimated > 0 || signal.stale > 0,
  );
export function summarizeLaps(laps: readonly AnalysisLap[]) {
  const complete = laps.flatMap((lap) => {
    const { ms, official } = lapTime(lap);
    return ms === null ? [] : [{ lap, ms, official }];
  });
  const best = complete.reduce<(typeof complete)[number] | undefined>(
    (best, timed) => (!best || timed.ms < best.ms ? timed : best),
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
  const approximate = complete.some(({ official }) => !official);
  return {
    best: best?.lap,
    fastest,
    complete: complete.length,
    gaps,
    withoutTime: laps.length - complete.length - gaps,
    bestTime: best?.ms ?? null,
    bestOfficial: best?.official ?? false,
    mean: complete.length
      ? complete.reduce((sum, timed) => sum + timed.ms, 0) / complete.length
      : null,
    meanOfficial: complete.length > 0 && !approximate,
    approximate,
    maxSpeed: fastest?.speed.max == null ? null : fastest.speed.max * 3.6,
  };
}
