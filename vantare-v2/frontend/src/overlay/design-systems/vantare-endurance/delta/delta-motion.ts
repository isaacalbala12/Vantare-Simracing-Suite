import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";

/**
 * Discrete events derived from two consecutive delta ViewModels. Pure — no DOM,
 * no timers.
 */
export type DeltaMotionEvent =
  /** Crossed zero: the lap turned from losing to gaining, or the reverse. */
  | { kind: "cross-zero"; to: "gaining" | "losing" }
  /** A new personal best replaced the reference the delta is measured against. */
  | { kind: "new-best" };

/** A tone only counts as a side of zero when it is not the neutral band. */
function side(model: DeltaViewModel): "gaining" | "losing" | null {
  return model.tone === "gaining" || model.tone === "losing" ? model.tone : null;
}

export function deriveDeltaEvents(
  prev: DeltaViewModel | null,
  next: DeltaViewModel,
): DeltaMotionEvent[] {
  if (!prev || prev.status !== "ready" || next.status !== "ready") {
    return [];
  }
  const events: DeltaMotionEvent[] = [];

  const from = side(prev);
  const to = side(next);
  if (from && to && from !== to) {
    events.push({ kind: "cross-zero", to });
  }

  // The reference lap changing is the other thing worth announcing: the bar is
  // now measured against a different lap, so its meaning just shifted.
  if (
    next.bestLapText !== prev.bestLapText &&
    next.bestLapText.trim() !== "" &&
    next.bestLapText !== "—"
  ) {
    events.push({ kind: "new-best" });
  }

  return events;
}
