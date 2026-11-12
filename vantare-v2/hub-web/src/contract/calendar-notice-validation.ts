import { isCalendarRevision, number, text } from "./calendar-common";
import {
  calendarMinuteLimit,
  calendarNoticeTtlMs,
  calendarTimestampLimit,
} from "./generated/calendar";
import { exact, record } from "./validation-common";
export function isCalendarNotice(v: unknown) {
  if (
    !record(v) ||
    !isCalendarRevision(v.id) ||
    !number(v.issuedAt, calendarTimestampLimit * 1000) ||
    !number(v.expiresAt, calendarTimestampLimit * 1000) ||
    v.expiresAt < v.issuedAt ||
    v.expiresAt - v.issuedAt > calendarNoticeTtlMs ||
    typeof v.silent !== "boolean"
  )
    return false;
  const base = ["kind", "id", "issuedAt", "expiresAt", "silent"];
  switch (v.kind) {
    case "test":
      return (
        exact(v, [...base, "requestId"]) && number(v.requestId, 0xffffffff)
      );
    case "start":
      return (
        exact(v, [...base, "series", "track", "at", "raceMinutes"]) &&
        text(v.series) &&
        v.series.trim().length > 0 &&
        text(v.track) &&
        number(v.at, calendarTimestampLimit * 1000) &&
        v.at >= v.expiresAt &&
        number(v.raceMinutes, calendarMinuteLimit)
      );
    case "week":
      return (
        exact(v, [...base, "from", "until"]) &&
        number(v.from, calendarTimestampLimit * 1000) &&
        number(v.until, calendarTimestampLimit * 1000) &&
        v.until > v.from
      );
    default:
      return false;
  }
}
