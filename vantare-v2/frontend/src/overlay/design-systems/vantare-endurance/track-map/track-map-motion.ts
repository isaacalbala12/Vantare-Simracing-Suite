import type { TrackMapMarker } from "../../../widget-types/track-map/track-map-view-model";

/**
 * Marker motion for the track map. Pure — no DOM, no timers, no clock.
 *
 * Positions arrive at the rate telemetry is published, which is slower than the
 * screen refreshes, so drawing them raw makes every car hop. This eases each
 * marker toward its published position instead, and never past it: a car is
 * only shown somewhere it has been or is going, never somewhere predicted.
 */
export type MarkerPosition = Readonly<{ x: number; y: number }>;

/** Displayed positions, keyed by the vehicle identity from the contract. */
export type MarkerPositions = ReadonlyMap<string, MarkerPosition>;

export type MotionOptions = Readonly<{
  /**
   * Time for the gap to the target to shrink by about 63%. Smaller is tighter
   * and twitchier, larger is smoother and laggier.
   */
  timeConstantMs: number;
  /**
   * Distance beyond which a marker jumps instead of sliding. A car cannot cross
   * a quarter of the map between two samples, so a gap that large is a reset, a
   * teleport to the pits or a session change, and sliding through the infield
   * would be a lie.
   */
  snapDistance: number;
}>;

export const DEFAULT_MOTION_OPTIONS: MotionOptions = {
  timeConstantMs: 90,
  snapDistance: 60,
};

/**
 * Advances the displayed positions toward the published ones.
 *
 * Markers are matched by identity, never by order or slot. The contract's
 * vehicle id carries a generation, so a slot reused by a different car gets a
 * new key here and starts where it is rather than sliding across the map from
 * whoever held the slot before.
 */
export function advanceMarkers(
  displayed: MarkerPositions,
  targets: readonly TrackMapMarker[],
  elapsedMs: number,
  options: MotionOptions = DEFAULT_MOTION_OPTIONS,
): MarkerPositions {
  const next = new Map<string, MarkerPosition>();
  const factor = easeFactor(elapsedMs, options.timeConstantMs);

  for (const target of targets) {
    const from = displayed.get(target.id);
    if (!from) {
      // First sight of this car: it has no history to travel from.
      next.set(target.id, { x: target.x, y: target.y });
      continue;
    }
    const deltaX = target.x - from.x;
    const deltaY = target.y - from.y;
    if (Math.hypot(deltaX, deltaY) >= options.snapDistance) {
      next.set(target.id, { x: target.x, y: target.y });
      continue;
    }
    next.set(target.id, {
      x: from.x + deltaX * factor,
      y: from.y + deltaY * factor,
    });
  }

  // Cars absent from the published frame are dropped rather than left behind,
  // so the map cannot accumulate ghosts across a session.
  return next;
}

/**
 * Fraction of the remaining gap to close over this frame.
 *
 * Exponential rather than a fixed step, so the same journey takes the same time
 * whatever the refresh rate: two 8 ms frames close the same gap as one 16 ms
 * frame.
 */
function easeFactor(elapsedMs: number, timeConstantMs: number): number {
  if (!(elapsedMs > 0) || !(timeConstantMs > 0)) {
    return 1;
  }
  return 1 - Math.exp(-elapsedMs / timeConstantMs);
}
