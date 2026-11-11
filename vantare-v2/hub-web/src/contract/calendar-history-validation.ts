import { list, number, text } from "./calendar-common";
import {
  type CalendarHistoryView,
  calendarHistoryWeeksLimit,
  calendarSeriesLimit,
  calendarTimestampLimit,
} from "./generated/calendar";
import { exact, record } from "./validation-common";

function track(value: unknown) {
  return (
    record(value) &&
    exact(value, ["seriesId", "name", "track"]) &&
    text(value.seriesId) &&
    value.seriesId.trim().length > 0 &&
    text(value.name) &&
    value.name.trim().length > 0 &&
    text(value.track)
  );
}
function week(value: unknown) {
  return (
    record(value) &&
    exact(value, ["from", "until", "seenAt", "tracks"]) &&
    number(value.from, calendarTimestampLimit) &&
    number(value.until, calendarTimestampLimit) &&
    value.until > value.from &&
    number(value.seenAt, calendarTimestampLimit) &&
    list(value.tracks, calendarSeriesLimit, track) &&
    new Set(value.tracks.map((item) => (item as { seriesId: string }).seriesId))
      .size === value.tracks.length
  );
}
export function isCalendarHistory(
  value: unknown,
): value is CalendarHistoryView {
  if (
    !record(value) ||
    !exact(value, ["weeks", "invalidCache"]) ||
    typeof value.invalidCache !== "boolean" ||
    !list(value.weeks, calendarHistoryWeeksLimit, week)
  )
    return false;
  const weeks = value.weeks as { from: number }[];
  return weeks.every(
    (item, index) => index === 0 || item.from > weeks[index - 1].from,
  );
}
