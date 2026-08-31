import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import { resolveStandingsSessionMode } from "../../../widget-types/standings/standings-formatting";
import { groupRowsByClass } from "./standings-endurance-shared";

/** Discrete race events derived from two consecutive ViewModels. Pure — no DOM, no timers. */
export type StandingsMotionEvent =
  | { kind: "overtake"; gainerId: string; loserId: string; vehicleClass: string }
  | { kind: "session-best"; rowId: string; previousRowId: string | null }
  | { kind: "pit-in"; rowId: string }
  | { kind: "pit-out"; rowId: string; tireCompound: string; tireChanged: boolean };

export type BattlePair = {
  aheadId: string;
  behindId: string;
  vehicleClass: string;
  intervalSeconds: number;
};

export const BATTLE_THRESHOLD_SECONDS = 0.8;

/** Positions within each class block, keyed by row id (1-based, matching what Redline renders). */
export function classPositionsById(model: StandingsViewModel): Map<string, number> {
  const positions = new Map<string, number>();
  for (const group of groupRowsByClass(model.rows)) {
    group.rows.forEach((row, index) => positions.set(row.id, index + 1));
  }
  return positions;
}

function parseGapSeconds(row: StandingsRowViewModel): number | null {
  const value = Number.parseFloat(row.gapText.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function sessionBestHolder(model: StandingsViewModel): string | null {
  let bestId: string | null = null;
  let best: number | null = null;
  for (const row of model.rows) {
    const match = /^(?:(\d+):)?(\d{1,2}\.\d{1,3})$/.exec(row.bestLapText.trim());
    if (!match) {
      continue;
    }
    const seconds = (match[1] ? Number(match[1]) : 0) * 60 + Number(match[2]);
    if (best === null || seconds < best) {
      best = seconds;
      bestId = row.id;
    }
  }
  return bestId;
}

/**
 * Derives discrete events between two models. Overtakes are per-class position
 * swaps confirmed on both sides (a gainer requires a loser) so noisy renumbering
 * of the whole field never fires a cascade of animations.
 */
export function deriveStandingsEvents(
  prev: StandingsViewModel | null,
  next: StandingsViewModel,
): StandingsMotionEvent[] {
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return [];
  }
  const events: StandingsMotionEvent[] = [];

  const prevPositions = classPositionsById(prev);
  const nextPositions = classPositionsById(next);
  const prevRows = new Map(prev.rows.map((row) => [row.id, row]));

  for (const group of groupRowsByClass(next.rows)) {
    for (const row of group.rows) {
      const before = prevPositions.get(row.id);
      const after = nextPositions.get(row.id);
      if (before === undefined || after === undefined || after >= before) {
        continue;
      }
      const loser = group.rows.find((candidate) => {
        const candidateBefore = prevPositions.get(candidate.id);
        const candidateAfter = nextPositions.get(candidate.id);
        return (
          candidate.id !== row.id &&
          candidateBefore !== undefined &&
          candidateAfter !== undefined &&
          candidateAfter > candidateBefore &&
          candidateBefore === after
        );
      });
      if (loser) {
        events.push({
          kind: "overtake",
          gainerId: row.id,
          loserId: loser.id,
          vehicleClass: group.vehicleClass,
        });
      }
    }
  }

  const prevBest = sessionBestHolder(prev);
  const nextBest = sessionBestHolder(next);
  if (nextBest !== null && nextBest !== prevBest) {
    events.push({ kind: "session-best", rowId: nextBest, previousRowId: prevBest });
  }

  for (const row of next.rows) {
    const before = prevRows.get(row.id);
    if (!before) {
      continue;
    }
    if (!before.pitText && row.pitText) {
      events.push({ kind: "pit-in", rowId: row.id });
    }
    if (before.pitText && !row.pitText) {
      events.push({
        kind: "pit-out",
        rowId: row.id,
        tireCompound: row.tireCompound,
        tireChanged: row.tireCompound !== before.tireCompound,
      });
    }
  }

  return events;
}

/**
 * Continuous battle state: adjacent same-class rows separated by less than the
 * threshold. Pure per-model; the hook layer decides when a sustained pair
 * crystallizes into the battle box.
 */
export function deriveBattlePairs(
  model: StandingsViewModel,
  thresholdSeconds: number = BATTLE_THRESHOLD_SECONDS,
): BattlePair[] {
  if (
    model.status !== "ready" ||
    resolveStandingsSessionMode(model.sessionLabel) !== "race"
  ) {
    return [];
  }
  const groups = groupRowsByClass(model.rows);
  const renderedRows = groups.flatMap((group) => group.rows);
  const playerIndex = renderedRows.findIndex((row) => row.isPlayer);
  if (playerIndex === -1) {
    return [];
  }
  const rowIndexes = new Map(renderedRows.map((row, index) => [row.id, index]));
  const candidates: {
    pair: BattlePair;
    playerDistance: number;
    intervalSeconds: number;
    order: number;
  }[] = [];
  let order = 0;
  for (const group of groups) {
    for (let index = 0; index + 1 < group.rows.length; index += 1) {
      const ahead = group.rows[index]!;
      const behind = group.rows[index + 1]!;
      if (ahead.pitText || behind.pitText) {
        continue;
      }
      const aheadGap = index === 0 ? 0 : parseGapSeconds(ahead);
      const behindGap = parseGapSeconds(behind);
      if (aheadGap === null || behindGap === null) {
        continue;
      }
      const interval = behindGap - aheadGap;
      if (interval >= 0 && interval < thresholdSeconds) {
        const aheadIndex = rowIndexes.get(ahead.id) ?? Number.POSITIVE_INFINITY;
        const behindIndex = rowIndexes.get(behind.id) ?? Number.POSITIVE_INFINITY;
        candidates.push({
          pair: {
            aheadId: ahead.id,
            behindId: behind.id,
            vehicleClass: group.vehicleClass,
            intervalSeconds: Number(interval.toFixed(1)),
          },
          playerDistance: Math.min(
            Math.abs(aheadIndex - playerIndex),
            Math.abs(behindIndex - playerIndex),
          ),
          intervalSeconds: interval,
          order,
        });
        order += 1;
      }
    }
  }
  candidates.sort(
    (left, right) =>
      left.playerDistance - right.playerDistance ||
      left.intervalSeconds - right.intervalSeconds ||
      left.order - right.order,
  );
  return candidates[0] ? [candidates[0].pair] : [];
}

/**
 * FLIP offsets: for every row whose in-class index changed, the vertical pixel
 * offset from where it used to be. The renderer applies the offset instantly
 * (First+Invert) and lets a CSS transition play it back to zero.
 */
export function deriveFlipOffsets(
  prev: StandingsViewModel | null,
  next: StandingsViewModel,
  rowStridePx: number,
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return offsets;
  }
  const prevPositions = classPositionsById(prev);
  const nextPositions = classPositionsById(next);
  for (const [id, after] of nextPositions) {
    const before = prevPositions.get(id);
    if (before !== undefined && before !== after) {
      offsets.set(id, (before - after) * rowStridePx);
    }
  }
  return offsets;
}

export type RosterChange = {
  /** Rows present now that were absent before. */
  entered: string[];
  /** Rows that vanished, with where they sat so the renderer can ghost them out in place. */
  retired: { row: StandingsRowViewModel; vehicleClass: string; classIndex: number }[];
};

/**
 * Roster diff between two ready models: who joined the field and who left it.
 * Retirements carry the row's last ViewModel plus its in-class index so the
 * template can render a fading ghost exactly where the car used to be.
 */
export function deriveRosterChange(
  prev: StandingsViewModel | null,
  next: StandingsViewModel,
): RosterChange {
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return { entered: [], retired: [] };
  }
  const prevIds = new Set(prev.rows.map((row) => row.id));
  const nextIds = new Set(next.rows.map((row) => row.id));
  const entered = next.rows.filter((row) => !prevIds.has(row.id)).map((row) => row.id);
  const retired: RosterChange["retired"] = [];
  for (const group of groupRowsByClass(prev.rows)) {
    group.rows.forEach((row, index) => {
      if (!nextIds.has(row.id)) {
        retired.push({ row, vehicleClass: group.vehicleClass, classIndex: index });
      }
    });
  }
  return { entered, retired };
}

/** Net positions gained (+) or lost (−) from an explicit same-session grid source. */
export function derivePositionDeltas(model: StandingsViewModel): Map<string, number> {
  const deltas = new Map<string, number>();
  if (model.status !== "ready" || resolveStandingsSessionMode(model.sessionLabel) !== "race") {
    return deltas;
  }
  for (const row of model.rows) {
    const start = row.gridPosition;
    if (
      Number.isSafeInteger(start) &&
      start !== undefined &&
      start > 0 &&
      Number.isSafeInteger(row.position) &&
      row.position > 0 &&
      start !== row.position
    ) {
      deltas.set(row.id, start - row.position);
    }
  }
  return deltas;
}
