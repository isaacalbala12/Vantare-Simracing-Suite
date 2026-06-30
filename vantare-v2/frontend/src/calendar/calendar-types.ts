// Calendar data model mirrored from internal/calendar (Go).
// Keep this file a pure type module with no runtime dependencies so it can be
// imported safely by both React components and tests.

export type RaceEvent = {
  id: string;
  title: string;
  sim: string;
  track: string;
  series: string;
  sessionLabel: string;
  // startTime is an RFC3339 string with timezone offset. Components use the
  // browser Date constructor to render and compare.
  startTime: string;
  durationMin: number;
  registrationUrl: string;
  source: string;
  notes: string;
};

export type Calendar = {
  version: number;
  timezone: string;
  reminderMinutes: number[];
  events: RaceEvent[];
  updated: string;
};

export const DEFAULT_REMINDER_MINUTES: number[] = [30, 15, 10, 5, 2];

export const DEFAULT_TIMEZONE = "Europe/Madrid";

export const EMPTY_CALENDAR: Calendar = {
  version: 1,
  timezone: DEFAULT_TIMEZONE,
  reminderMinutes: DEFAULT_REMINDER_MINUTES,
  events: [],
  updated: "",
};

// NextRaceCard / LastActivityCard have to choose between three high-level
// states. Keeping them as a discriminated union makes the consumers'
// branches exhaustive and the tests trivial.
export type CalendarState =
  | { kind: "no-calendar" }
  | { kind: "loaded"; calendar: Calendar };

// hasCalendar reports whether the calendar has at least one event. Used by
// the dashboard cards to decide between "no events yet" and "events present".
export function hasCalendar(state: CalendarState): boolean {
  if (state.kind !== "loaded") return false;
  return state.calendar.events.length > 0;
}

// isEventActive reports whether the event is currently running.
// The check mirrors Go's IsActiveAt: start <= now < end.
export function isEventActive(event: RaceEvent, now: Date): boolean {
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start.getTime() + eventDurationMs(event));
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

// eventEnd returns the Date at which the event finishes.
export function eventEnd(event: RaceEvent): Date {
  const start = new Date(event.startTime);
  return new Date(start.getTime() + eventDurationMs(event));
}

function eventDurationMs(event: RaceEvent): number {
  const dur = Number.isFinite(event.durationMin) ? event.durationMin : 0;
  if (dur <= 0) return 0;
  return dur * 60_000;
}

// formatCountdown produces a short human string like "En 2h 14m" or
// "En 42m" or "Ahora". The output is empty when the event is in the past.
export function formatCountdown(event: RaceEvent, now: Date): string {
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return "";
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) {
    if (isEventActive(event, now)) return "Ahora";
    return "";
  }
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) {
    return `En ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `En ${hours}h ${pad(mins)}m`;
  }
  return `En ${mins}m`;
}

// formatEventDate renders a stable short date like "Jueves 2 Jul · 20:00".
// It is locale-independent (Spanish month/weekday names) to match the rest
// of the Hub copy.
const SPANISH_WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const SPANISH_MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function formatEventDate(event: RaceEvent): string {
  const d = new Date(event.startTime);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = SPANISH_WEEKDAYS[d.getDay()];
  const month = SPANISH_MONTHS[d.getMonth()];
  return `${weekday} ${d.getDate()} ${month} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
