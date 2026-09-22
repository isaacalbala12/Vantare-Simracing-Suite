import type { FastestLapTiming, FastestLapViewModel } from "./fastest-lap-view-model";

type Notice = { scopeKey: string; timing: FastestLapTiming } | null;

/** Instance-local presentation state. No polling, IPC or persistence. */
export function createFastestLapStore() {
  let previous: FastestLapViewModel | undefined;
  let recordMs: number | undefined;
  let notice: Notice = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function publish(next: Notice) {
    if (notice === next) return;
    notice = next;
    listeners.forEach(listener => listener());
  }

  function cancel() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function reset() {
    cancel();
    previous = undefined;
    recordMs = undefined;
    publish(null);
  }

  function accept(model: FastestLapViewModel) {
    if (model.status !== "ready") {
      reset();
      return;
    }
    if (!previous || previous.scopeKey !== model.scopeKey) {
      cancel();
      previous = model;
      recordMs = model.candidate?.bestMs;
      publish(null);
      return;
    }
    if (model.sequence <= previous.sequence) return;

    const candidate = model.candidate;
    const bestMs = candidate?.bestMs;
    const priorRow = candidate ? previous.rows.find(row => row.id === candidate.id) : undefined;
    const improved = bestMs !== undefined && (recordMs === undefined || bestMs < recordMs);
    // A newly appearing car can carry an old record. Only an observed
    // improvement, or its first observed completed lap, may raise an alert.
    const observedLap = priorRow && candidate && priorRow.driver === candidate.driver && bestMs !== undefined && (
      (priorRow.bestMs !== undefined && bestMs < priorRow.bestMs) ||
      (priorRow.bestMs === undefined && priorRow.laps !== undefined && candidate.laps !== undefined
        && candidate.laps > priorRow.laps && candidate.lastMs === bestMs)
    );
    previous = model;
    if (improved) recordMs = bestMs;
    if (!improved || !observedLap || !candidate) return;

    cancel();
    publish({ scopeKey: model.scopeKey, timing: candidate });
    timer = setTimeout(() => {
      timer = undefined;
      publish(null);
    }, model.durationMs);
  }

  return {
    accept, reset,
    getSnapshot: () => notice,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
