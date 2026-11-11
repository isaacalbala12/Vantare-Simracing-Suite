import type {
  CalendarAlerts,
  CalendarSchedule,
  CalendarView,
} from "../../../contract/generated/calendar";
import { civilDay, weekDays } from "../../ui/calendarDate";
import { alertAt, daily } from "./rows";
import { starts } from "./schedule";
export function monthWeeks(
  view: CalendarView,
  now: number,
  offset: number,
  utc: boolean,
  alerts: CalendarAlerts,
  limit: number,
) {
  const date = new Date(now),
    year = utc ? date.getUTCFullYear() : date.getFullYear(),
    month = (utc ? date.getUTCMonth() : date.getMonth()) + offset;
  const first = Date.UTC(year, month, 1),
    end = Date.UTC(year, month + 1, 1),
    firstDate = new Date(first);
  const begin = first - ((firstDate.getUTCDay() + 5) % 7) * 86400000;
  const current = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - ((date.getUTCDay() + 5) % 7),
  );
  const weeks = [];
  for (let start = begin; start < end; start += 7 * 86400000) {
    const schedule =
      [view.official, view.previous, view.fallback].find(
        (s) => s && Date.parse(s.validFrom) === start,
      ) ?? null;
    const state =
      start === current
        ? "now"
        : start < current
          ? schedule
            ? "past"
            : "unsaved"
          : "unpublished";
    const days = weekDays(start, utc);
    const facts = schedule
      ? days.map((at) =>
          dayFacts(
            schedule,
            at,
            utc,
            start === current ? alerts : undefined,
            now,
            limit,
          ),
        )
      : undefined;
    const bars: { series: number; from: number; to: number; lane: number }[] =
      [];
    const laneEnds: number[] = [];
    if (facts && schedule)
      for (let index = 0; index < schedule.series.length; index++) {
        let day = 0;
        while (day < 7) {
          if (!facts[day].events.includes(index)) {
            day++;
            continue;
          }
          const from = day;
          while (day < 7 && facts[day].events.includes(index)) day++;
          let lane = laneEnds.findIndex((end) => end <= from);
          if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(0);
          }
          laneEnds[lane] = day;
          bars.push({ series: index, from, to: day - 1, lane });
        }
      }
    const reserved = days.map((_, day) =>
      Math.max(
        0,
        ...bars
          .filter((b) => b.from <= day && b.to >= day)
          .map((b) => b.lane + 1),
      ),
    );
    weeks.push({ start, days, schedule, state, facts, bars, reserved });
  }
  return { first, weeks };
}
function dayFacts(
  schedule: CalendarSchedule,
  day: number,
  utc: boolean,
  alerts: CalendarAlerts | undefined,
  now: number,
  limit: number,
) {
  const until = civilDay(day, 1, utc),
    perHour = Array<number>(24).fill(0),
    eventHours = Array<boolean>(24).fill(false),
    events: number[] = [];
  let total = 0,
    count = 0;
  schedule.series.forEach((series, index) => {
    const slots = starts(schedule, series, day, until, limit);
    if (slots.length && !daily(series)) events.push(index);
    for (const at of slots) {
      const date = new Date(at),
        hour = utc ? date.getUTCHours() : date.getHours();
      perHour[hour]++;
      eventHours[hour] ||= !daily(series);
      total++;
      if (alerts && at >= now && alertAt(schedule, series, at, alerts, limit))
        count++;
    }
  });
  const density = perHour.map((count, hour) => ({
    hour,
    count,
    event: eventHours[hour],
  }));
  return { perHour, eventHours, density, events, total, alerts: count };
}
