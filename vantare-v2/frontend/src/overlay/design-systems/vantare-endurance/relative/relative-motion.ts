import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";

/**
 * Discrete events derived from two consecutive relative ViewModels. Pure — no
 * DOM, no timers — so the same derivation can be unit tested and replayed in
 * the Workshop.
 */
export type RelativeMotionEvent =
  /** Crossed the player: someone who was ahead is now behind, or the reverse. */
  | { kind: "cross"; rowId: string; to: "ahead" | "behind" }
  /** Appeared in the visible window, whether by closing in or by rejoining. */
  | { kind: "enter"; rowId: string }
  /** Dropped out of the visible window. */
  | { kind: "exit"; rowId: string };

/** Rows keyed by id, ignoring the player's own row. */
function rivalsById(model: RelativeViewModel): Map<string, RelativeRowViewModel> {
  const rivals = new Map<string, RelativeRowViewModel>();
  for (const row of model.rows) {
    if (!row.isPlayer) {
      rivals.set(row.id, row);
    }
  }
  return rivals;
}

function side(row: RelativeRowViewModel): "ahead" | "behind" | null {
  if (!row.isPlayer && (row.side === "ahead" || row.side === "behind")) {
    return row.side;
  }
  return null;
}

export function deriveRelativeEvents(
  prev: RelativeViewModel | null,
  next: RelativeViewModel,
): RelativeMotionEvent[] {
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return [];
  }
  const before = rivalsById(prev);
  const after = rivalsById(next);
  const events: RelativeMotionEvent[] = [];

  for (const [id, row] of after) {
    const previous = before.get(id);
    if (!previous) {
      events.push({ kind: "enter", rowId: id });
      continue;
    }
    const from = side(previous);
    const to = side(row);
    if (from && to && from !== to) {
      events.push({ kind: "cross", rowId: id, to });
    }
  }

  for (const id of before.keys()) {
    if (!after.has(id)) {
      events.push({ kind: "exit", rowId: id });
    }
  }

  return events;
}

/**
 * Vertical offsets for a FLIP slide, in pixels: where each row was versus where
 * it now is. Only rows present in both models move; entries and exits are
 * animated separately because they have no "before" to slide from.
 */
export function deriveRelativeFlipOffsets(
  prev: RelativeViewModel | null,
  next: RelativeViewModel,
  rowStridePx: number,
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return offsets;
  }
  const previousIndex = new Map(prev.rows.map((row, index) => [row.id, index]));
  next.rows.forEach((row, index) => {
    const before = previousIndex.get(row.id);
    if (before === undefined || before === index) {
      return;
    }
    offsets.set(row.id, (before - index) * rowStridePx);
  });
  return offsets;
}

/**
 * Rows within striking distance of the player, by absolute gap. Used to mark
 * the rows worth watching without inventing a new threshold per template.
 */
export const RELATIVE_THREAT_SECONDS = 1;

export function deriveThreatRows(model: RelativeViewModel): Set<string> {
  const threats = new Set<string>();
  if (model.status !== "ready") {
    return threats;
  }
  for (const row of model.rows) {
    if (row.isPlayer || row.gapSeconds === null) {
      continue;
    }
    if (Math.abs(row.gapSeconds) <= RELATIVE_THREAT_SECONDS) {
      threats.add(row.id);
    }
  }
  return threats;
}
