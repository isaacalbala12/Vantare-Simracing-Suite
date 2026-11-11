import type {
  CalendarSchedule,
  CalendarSeries,
} from "../../../contract/generated/calendar";
import { daily, leadMinutes, raceMinutes } from "./rows";
import { starts } from "./schedule";

/** The drawer only offers departures from the currently published schedule. */
export function detailDepartures(
  schedule: CalendarSchedule,
  series: CalendarSeries,
  now: number,
  limit: number,
) {
  return starts(
    schedule,
    series,
    now,
    Date.parse(schedule.validUntil),
    limit,
  ).slice(0, daily(series) ? 10 : 12);
}
export function detailPhases(series: CalendarSeries, at: number | undefined) {
  const practice =
    series.sessions.find((session) => session.name === "practice")
      ?.durationMin ?? 3;
  const lead = leadMinutes(series),
    race = raceMinutes(series);
  const qualifying = lead - practice;
  return {
    minutes: [practice, qualifying, race],
    weights: [Math.max(practice, 4), qualifying, Math.min(race, 60)],
    raceAt: at === undefined ? undefined : at + lead * 60_000,
    endAt: at === undefined ? undefined : at + (lead + race) * 60_000,
  };
}
