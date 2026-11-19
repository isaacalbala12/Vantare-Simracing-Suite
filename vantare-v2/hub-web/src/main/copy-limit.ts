/**
 * A minimum pause between two copies of the plan to the clipboard: the renderer
 * asks, main writes, so a loop of requests must not turn into a loop of writes.
 * No timer: it only compares two moments, so there is nothing to close.
 */
export function copyLimiter(now: () => number = Date.now, intervalMs = 1000) {
  let last: number | undefined;
  return {
    /** `true` when this copy may go on; it then starts the pause. */
    allow(): boolean {
      const moment = now();
      // a clock that went back does not freeze the limiter
      if (last !== undefined && moment >= last && moment - last < intervalMs)
        return false;
      last = moment;
      return true;
    },
  };
}
