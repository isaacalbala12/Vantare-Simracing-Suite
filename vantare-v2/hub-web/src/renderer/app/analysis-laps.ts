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

export function recordingBestTime(
  sessions: readonly AnalysisSessionSummary[],
  approximate: number | null = null,
) {
  let best: number | null = null;
  for (const { bestLapMs } of sessions) {
    if (bestLapMs !== null && (best === null || bestLapMs < best))
      best = bestLapMs;
  }
  return { ms: best ?? approximate, official: best !== null };
}

export function bestApproximateLapTime(laps: readonly AnalysisLap[]) {
  let best: number | null = null;
  for (const { sealed, gap, lapTimeApproxMs } of laps) {
    if (
      sealed &&
      !gap &&
      lapTimeApproxMs !== null &&
      (best === null || lapTimeApproxMs < best)
    )
      best = lapTimeApproxMs;
  }
  return best;
}

/** The lap of the last block saved: what an incomplete recording keeps (#2871). */
export function lastSavedLap(laps: readonly AnalysisLap[]) {
  let last: AnalysisLap | undefined;
  for (const lap of laps) if (!last || lap.index > last.index) last = lap;
  return last?.lap;
}

export const validLapTime = (lap: AnalysisLap) => lapTime(lap).ms;

// The reply's original position is what lap.session refers to.
export function orderedSessions(
  sessions: readonly AnalysisSessionSummary[] = [],
) {
  return sessions
    .map((session, position) => ({ session, position }))
    .sort((a, b) => b.session.startedAtMs - a.session.startedAtMs)
    .map((entry, index) => ({ ...entry, number: sessions.length - index }));
}

export function groupSessionLaps(
  laps: readonly AnalysisLap[],
  sessions: ReturnType<typeof orderedSessions>,
) {
  const groups = new Map(
    sessions.map((entry) => [
      entry.position,
      { ...entry, laps: [] as AnalysisLap[] },
    ]),
  );
  const unassigned: AnalysisLap[] = [];
  for (const lap of laps) {
    const group = lap.session === null ? undefined : groups.get(lap.session);
    (group?.laps ?? unassigned).push(lap);
  }
  return [
    ...[...groups.values()].filter((group) => group.laps.length > 0),
    ...(unassigned.length || !sessions.length
      ? [
          {
            session: undefined,
            position: undefined,
            number: undefined,
            laps: unassigned,
          },
        ]
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
