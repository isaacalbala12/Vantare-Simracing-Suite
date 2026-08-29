import type { Calendar, CalendarState } from "../../calendar/calendar-types";
import {
  requestCalendar,
  subscribeToCalendar,
  subscribeToCalendarErrors,
} from "../../calendar/calendar-store";
import type { WidgetRuntimeInput, WidgetRuntimeStatus } from "./widget-definition";

export type RaceScheduleSnapshot = Readonly<{
  events: NonNullable<WidgetRuntimeInput["raceScheduleEvents"]>;
  status: WidgetRuntimeStatus;
}>;

export type RaceScheduleSource = Readonly<{
  start(onCalendar: (calendar: Calendar) => void, onError: () => void): () => void;
}>;

export type RaceScheduleStore = Readonly<{
  getSnapshot(): RaceScheduleSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  dispose(): void;
}>;

export const EMPTY_RACE_SCHEDULE_SNAPSHOT: RaceScheduleSnapshot = Object.freeze({
  events: Object.freeze([]),
  status: "missing",
});

export function createRaceScheduleStore(source: RaceScheduleSource): RaceScheduleStore {
  let snapshot = EMPTY_RACE_SCHEDULE_SNAPSHOT;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: RaceScheduleSnapshot) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (stop) return;
      stop = source.start(
        (calendar) => publish({ events: mapCalendarEvents(calendar), status: "ready" }),
        () => publish({
          events: snapshot.events,
          status: snapshot.events.length > 0 ? "stale" : "error",
        }),
      );
    },
    dispose() {
      stop?.();
      stop = undefined;
      listeners.clear();
    },
  };
}

export function createWailsRaceScheduleStore(): RaceScheduleStore {
  return createRaceScheduleStore({
    start(onCalendar, onError) {
      const unsubscribeCalendar = subscribeToCalendar((state: CalendarState) => {
        if (state.kind === "loaded") onCalendar(state.calendar);
      });
      const unsubscribeErrors = subscribeToCalendarErrors(onError);
      requestCalendar();
      return () => {
        unsubscribeCalendar?.();
        unsubscribeErrors?.();
      };
    },
  });
}

export function createHttpRaceScheduleStore(
  fetchCalendar: () => Promise<Calendar> = async () => {
    const response = await fetch("/api/calendar", { cache: "no-store" });
    if (!response.ok) throw new Error(`calendar HTTP ${response.status}`);
    return response.json() as Promise<Calendar>;
  },
): RaceScheduleStore {
  return createRaceScheduleStore({
    start(onCalendar, onError) {
      let active = true;
      const load = () => {
        void fetchCalendar().then(
          (calendar) => { if (active) onCalendar(calendar); },
          () => { if (active) onError(); },
        );
      };
      load();
      const timer = window.setInterval(load, 30_000);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    },
  });
}

function mapCalendarEvents(calendar: Calendar): RaceScheduleSnapshot["events"] {
  const seriesById = new Map((calendar.series ?? []).map((series) => [series.id, series]));
  return Object.freeze((calendar.events ?? []).map((event) => {
    const series = seriesById.get(event.series);
    return Object.freeze({
      id: event.id,
      title: event.title,
      track: event.track,
      startAt: event.startTime,
      durationMinutes: event.durationMin,
      classes: Object.freeze((series?.classes ?? []).map((entry) => entry.name)),
      status: event.sessionLabel || "scheduled",
      license: series?.licenseLabel,
    });
  }));
}
