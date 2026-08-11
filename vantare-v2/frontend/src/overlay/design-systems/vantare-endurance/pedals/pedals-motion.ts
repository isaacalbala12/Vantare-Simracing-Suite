/**
 * Brake peak tracking for the Redline pedals. Pure — no DOM, no timers — so the
 * rule for when a peak starts, grows and dies is testable on its own.
 */

/** Below this the brake reads as released, matching the template's own rest threshold. */
export const BRAKE_ENGAGED = 0.02;

/**
 * How far below the peak the pedal has to come back before the mark is worth
 * drawing. While the driver is still at the peak the mark would sit exactly on
 * the top of the fill and say nothing.
 */
export const PEAK_REVEAL_MARGIN = 0.03;

/**
 * Peak for the next frame. A peak belongs to one braking event: it is born when
 * the pedal leaves rest, only ever grows while the pedal is down, and dies when
 * the pedal comes back up, so the next corner starts from nothing.
 */
export function nextBrakePeak(previousPeak: number | null, brake: number): number | null {
  if (brake <= BRAKE_ENGAGED) {
    return null;
  }
  if (previousPeak === null) {
    return brake;
  }
  return Math.max(previousPeak, brake);
}

/**
 * Whether the peak is worth showing: only once the pedal has eased off it, and
 * never while the brake is still climbing towards it.
 */
export function shouldRevealPeak(peak: number | null, brake: number): boolean {
  return peak !== null && brake > BRAKE_ENGAGED && peak - brake >= PEAK_REVEAL_MARGIN;
}
