import type { FastestLapNotice, FastestLapTiming, FastestLapViewModel } from "./fastest-lap-view-model";

const FASTEST_LAP_EXIT_MS = 220;
type Notice = (FastestLapNotice & { scopeKey: string }) | null;

function improves(timing: FastestLapTiming | undefined, record: number | undefined): boolean {
  return timing?.bestMs !== undefined && (record === undefined || timing.bestMs < record);
}

// A newly appearing car can carry an old record. Only an observed improvement,
// or its first observed completed lap, may raise an alert.
function observedLap(current: FastestLapTiming | undefined, prior: FastestLapTiming | undefined): boolean {
  if (!current || !prior || prior.id !== current.id || prior.driver !== current.driver || current.bestMs === undefined) return false;
  return (prior.bestMs !== undefined && current.bestMs < prior.bestMs)
    || (prior.bestMs === undefined && prior.laps !== undefined && current.laps !== undefined
      && current.laps > prior.laps && current.lastMs === current.bestMs);
}

/** Instance-local presentation state. No polling, IPC or persistence. */
export function createFastestLapStore() {
  let previous: FastestLapViewModel | undefined;
  let classRecordMs: number | undefined;
  let personalRecordMs: number | undefined;
  let nextId = 0;
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
    classRecordMs = undefined;
    personalRecordMs = undefined;
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
      classRecordMs = model.candidate?.bestMs;
      personalRecordMs = model.personal?.bestMs;
      publish(null);
      return;
    }
    if (model.sequence <= previous.sequence) return;

    const classImproved = improves(model.candidate, classRecordMs);
    const personalImproved = improves(model.personal, personalRecordMs);
    const classLap = model.showClass && classImproved
      && observedLap(model.candidate, previous.rows.find(row => row.id === model.candidate?.id));
    const personalLap = model.showPersonal && personalImproved && observedLap(model.personal, previous.personal);
    previous = model;
    if (classImproved) classRecordMs = model.candidate?.bestMs;
    if (personalImproved) personalRecordMs = model.personal?.bestMs;
    const timing = classLap ? model.candidate : personalLap ? model.personal : undefined;
    if (!timing) return;

    cancel();
    const next: NonNullable<Notice> = {
      id: ++nextId, scopeKey: model.scopeKey, timing,
      kind: classLap ? "class" : "personal", phase: "visible",
    };
    publish(next);
    // The exit is part of the configured lifetime, with only one pending timer.
    timer = setTimeout(() => {
      publish({ ...next, phase: "leaving" });
      timer = setTimeout(() => {
        timer = undefined;
        publish(null);
      }, FASTEST_LAP_EXIT_MS);
    }, model.durationMs - FASTEST_LAP_EXIT_MS);
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
