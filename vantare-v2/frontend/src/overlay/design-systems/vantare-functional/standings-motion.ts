import type { StandingsRowViewModel, StandingsViewModel } from "../../widget-types/standings/standings-view-model";

export type FunctionalStandingsEvent = {
  rowId: string;
  kind: "position" | "personal-best" | "session-best";
  places?: number;
};

export function standingsMotionContinues(prev: StandingsViewModel, next: StandingsViewModel): boolean {
  return prev.status === "ready" && next.status === "ready"
    && prev.motionIdentity === next.motionIdentity
    && prev.sessionLabel === next.sessionLabel
    && prev.classificationMode === next.classificationMode
    && prev.classScope === next.classScope
    && !(prev.motionSequence !== undefined && next.motionSequence !== undefined && next.motionSequence < prev.motionSequence);
}

const validLap = (seconds: number | undefined): seconds is number => seconds !== undefined && Number.isFinite(seconds) && seconds > 0;

export function deriveFunctionalStandingsEvents(prev: StandingsViewModel, next: StandingsViewModel): FunctionalStandingsEvent[] {
  if (!standingsMotionContinues(prev, next)) return [];
  const before = new Map(prev.rows.map((row) => [row.id, row]));
  const events: FunctionalStandingsEvent[] = [];
  const lapVisible = next.columns.some((column) => column.metricId === "bestLap" && column.enabled);
  const position = (row: StandingsRowViewModel) => next.classificationMode === "multiclass" ? row.classPosition : row.position;
  for (const row of next.rows) {
    const old = before.get(row.id);
    if (!old || old.vehicleClass !== row.vehicleClass) continue;
    const previousPosition = position(old);
    const currentPosition = position(row);
    const places = previousPosition !== undefined && currentPosition !== undefined
      ? previousPosition - currentPosition : 0;
    const improved = validLap(old.bestLapSeconds) && validLap(row.bestLapSeconds)
      && row.bestLapSeconds < old.bestLapSeconds - 0.0005;
    const sessionBest = lapVisible && improved && next.sessionBest?.rowId === row.id
      && validLap(prev.sessionBest?.seconds) && validLap(next.sessionBest.seconds)
      && next.sessionBest.seconds < prev.sessionBest.seconds - 0.0005;
    // One transient per row; the most meaningful event wins.
    if (sessionBest) events.push({ rowId: row.id, kind: "session-best" });
    else if (Number.isInteger(places) && places !== 0) events.push({ rowId: row.id, kind: "position", places });
    else if (lapVisible && improved) events.push({ rowId: row.id, kind: "personal-best" });
  }
  const priority = { "session-best": 3, position: 2, "personal-best": 1 };
  return events.sort((a, b) => priority[b.kind] - priority[a.kind]);
}
