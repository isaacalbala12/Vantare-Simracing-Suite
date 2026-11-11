import type {
  CalendarAlerts,
  CalendarSchedule,
  CalendarSeries,
} from "../../../contract/generated/calendar";
import { civilDay } from "../../ui/calendarDate";
import { starts } from "./schedule";

const minute = 60_000;
export function daily(series: CalendarSeries) {
  return (
    series.eventKind !== "special" &&
    series.eventKind !== "weekly" &&
    series.recurrence.kind === "interval"
  );
}
export function raceMinutes(series: CalendarSeries) {
  return (
    series.sessions.find((s) => s.name === "race")?.durationMin ??
    series.raceDurationMin ??
    0
  );
}
export function leadMinutes(series: CalendarSeries) {
  return (
    (series.sessions.find((s) => s.name === "practice")?.durationMin ?? 3) +
    (series.sessions.find((s) => s.name === "qualifying")?.durationMin ?? 8)
  );
}
export function alertAt(
  schedule: CalendarSchedule,
  series: CalendarSeries,
  at: number,
  alerts: CalendarAlerts,
  limit: number,
) {
  if (!daily(series))
    return alerts.slots.some(
      (s) => s.seriesId === series.id && s.at * 1000 === at,
    );
  const band = alerts.bands.find((b) => b.seriesId === series.id);
  if (!band) return false;
  const date = new Date(at),
    mins = date.getHours() * 60 + date.getMinutes(),
    weekday = date.getDay();
  if (
    mins < band.from ||
    mins >= band.to ||
    (band.days === "weekdays" && (weekday === 0 || weekday === 6)) ||
    (band.days === "weekend" && weekday !== 0 && weekday !== 6)
  )
    return false;
  if (band.mode === "each") return true;
  const from = civilDay(at, 0, false) + band.from * minute;
  return (
    starts(
      schedule,
      series,
      from,
      from + (band.to - band.from) * minute,
      limit,
    )[0] === at
  );
}
export function nextStart(
  schedule: CalendarSchedule,
  series: CalendarSeries,
  now: number,
  limit: number,
) {
  const span =
    series.recurrence.kind === "interval"
      ? series.recurrence.intervalMinutes
      : 7 * 24 * 60;
  return starts(schedule, series, now, now + span * minute, limit)[0];
}
export function board(
  schedule: CalendarSchedule,
  now: number,
  following: readonly string[],
  limit: number,
) {
  const rows = schedule.series.map((series) => ({
    series,
    favorite: following.includes(series.id),
    next: nextStart(schedule, series, now, limit),
    starts: starts(
      schedule,
      series,
      now - 10 * minute,
      now + 90 * minute,
      limit,
    ),
  }));
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const rank = (s: CalendarSeries) =>
    ["beginner", "intermediate", "advanced"].indexOf(s.tier) < 0
      ? 3
      : ["beginner", "intermediate", "advanced"].indexOf(s.tier);
  return {
    favorites: rows
      .filter((r) => r.favorite)
      .sort(
        (a, b) =>
          (a.next ?? Infinity) - (b.next ?? Infinity) ||
          compare(a.series.name, b.series.name),
      ),
    rest: rows
      .filter((r) => !r.favorite)
      .sort(
        (a, b) =>
          rank(a.series) - rank(b.series) ||
          Number(a.series.eventKind === "special") -
            Number(b.series.eventKind === "special") ||
          compare(a.series.name, b.series.name),
      ),
  };
}
export function nextRace(
  schedule: CalendarSchedule,
  now: number,
  following: readonly string[],
  limit: number,
) {
  const rows = board(schedule, now, following, limit).favorites;
  const row = rows.find((r) => r.next !== undefined);
  if (!row || row.next === undefined) return undefined;
  const at = row.next;
  const after = rows
    .flatMap((r) =>
      starts(schedule, r.series, at, at + 6 * 60 * minute, limit)
        .slice(0, 4)
        .filter((t) => r.series.id !== row.series.id || t !== at)
        .map((time) => ({ series: r.series, time })),
    )
    .sort(
      (a, b) =>
        a.time - b.time ||
        (a.series.name < b.series.name
          ? -1
          : a.series.name > b.series.name
            ? 1
            : 0),
    );
  return { ...row, at, raceAt: at + leadMinutes(row.series) * minute, after };
}
