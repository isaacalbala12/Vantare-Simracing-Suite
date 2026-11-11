import type {
  CalendarSchedule,
  CalendarSeries,
} from "../../../contract/generated/calendar";
import { civilDay } from "../../ui/calendarDate";
import { daily, nextStart } from "./rows";
import { starts } from "./schedule";
export function raceDay(at: number, utc: boolean) {
  const date = new Date(at),
    hour = utc ? date.getUTCHours() : date.getHours();
  return civilDay(at, hour < 3 ? -1 : 0, utc);
}
export function calendarEvents(
  schedule: CalendarSchedule,
  now: number,
  limit: number,
) {
  return schedule.series
    .filter((series) => !daily(series))
    .map((series) => ({
      series,
      next: nextStart(schedule, series, now, limit),
    }))
    .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity));
}
export function eventDays(
  schedule: CalendarSchedule,
  series: CalendarSeries,
  now: number,
  utc: boolean,
  limit: number,
) {
  const groups = new Map<number, number[]>();
  for (const at of starts(
    schedule,
    series,
    Date.parse(schedule.validFrom),
    Date.parse(schedule.validUntil),
    limit,
  )) {
    const day = raceDay(at, utc);
    const slots = groups.get(day) ?? [];
    slots.push(at);
    groups.set(day, slots);
  }
  return [...groups].map(([day, slots]) => {
    const gone = slots.filter((at) => at < now),
      upcoming = slots.filter((at) => at >= now);
    return {
      day,
      slots: gone.length && upcoming.length ? upcoming : slots,
      hidden: gone.length && upcoming.length ? gone.length : 0,
    };
  });
}
