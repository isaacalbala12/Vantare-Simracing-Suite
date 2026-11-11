import {
  duration,
  isCalendarRevision,
  list,
  number,
  strings,
  text,
} from "../calendar-common";
import {
  isCalendarAlerts,
  isCalendarConfig,
} from "../calendar-config-validation";
import { isCalendarHistory } from "../calendar-history-validation";
import {
  calendarDateLimit,
  calendarIcsLimit,
  calendarTextLimit,
  calendarListLimit,
  calendarMinuteLimit,
  calendarSeriesLimit,
  calendarTimestampLimit,
  calendarWeekdays,
} from "../generated/calendar";
import { exact, record } from "../validation-common";

export { calendarMethods as methods } from "../generated/calendar";

export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || v.length > calendarDateLimit) return false;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      v,
    );
  if (!parts) return false;
  const millis = Date.parse(v),
    year = Number(parts[1]),
    month = Number(parts[2]),
    day = Number(parts[3]);
  const checked = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(millis) &&
    millis >= 0 &&
    Math.floor(millis / 1000) <= calendarTimestampLimit &&
    checked.getUTCFullYear() === year &&
    checked.getUTCMonth() === month - 1 &&
    checked.getUTCDate() === day
  );
}
function recurrence(v: unknown) {
  if (
    !record(v) ||
    !exact(v, ["kind", "intervalMinutes", "days", "timesUTC"]) ||
    !number(v.intervalMinutes, 0xffffffff) ||
    !list(v.days, calendarListLimit, text) ||
    !list(v.timesUTC, calendarListLimit, text)
  )
    return false;
  if (v.kind === "interval")
    return (
      number(v.intervalMinutes, calendarMinuteLimit) && v.intervalMinutes > 0
    );
  return (
    v.kind === "weekly-slots" &&
    strings(v.days, calendarWeekdays.length) &&
    v.days.length > 0 &&
    v.days.every((d) => calendarWeekdays.some((day) => day === d)) &&
    strings(v.timesUTC, calendarListLimit) &&
    v.timesUTC.length > 0 &&
    v.timesUTC.every((t) => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(t))
  );
}
function series(v: unknown) {
  const texts = [
    "id",
    "name",
    "track",
    "vehicleClass",
    "licenseLabel",
    "tier",
    "eventKind",
    "format",
    "setup",
    "assists",
    "safetyRating",
    "source",
  ];
  const durations = [
    "raceDurationMin",
    "eventDurationMin",
    "tyres",
    "splits",
    "veLimit",
  ];
  return (
    record(v) &&
    exact(v, [
      ...texts,
      ...durations,
      "classes",
      "sessions",
      "notes",
      "tyreWarmers",
      "startOffsetMinute",
      "recurrence",
    ]) &&
    texts.every((k) => text(v[k])) &&
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    durations.every((k) => duration(v[k])) &&
    typeof v.tyreWarmers === "boolean" &&
    typeof v.startOffsetMinute === "number" &&
    Number.isInteger(v.startOffsetMinute) &&
    Math.abs(v.startOffsetMinute) <= calendarMinuteLimit &&
    list(v.notes, calendarListLimit, text) &&
    list(
      v.classes,
      calendarListLimit,
      (c) => record(c) && exact(c, ["name"]) && text(c.name),
    ) &&
    list(
      v.sessions,
      calendarListLimit,
      (s) =>
        record(s) &&
        exact(s, ["name", "durationMin", "estimated"]) &&
        text(s.name) &&
        number(s.durationMin, calendarMinuteLimit) &&
        typeof s.estimated === "boolean",
    ) &&
    recurrence(v.recurrence)
  );
}
export function isCalendarSchedule(v: unknown) {
  return (
    record(v) &&
    exact(v, ["version", "timezone", "validFrom", "validUntil", "series"]) &&
    v.version === 1 &&
    v.timezone === "UTC" &&
    isCalendarDate(v.validFrom) &&
    isCalendarDate(v.validUntil) &&
    Date.parse(v.validUntil) > Date.parse(v.validFrom) &&
    list(v.series, calendarSeriesLimit, series) &&
    v.series.length > 0 &&
    new Set(v.series.map((s) => (s as { id: string }).id)).size ===
      v.series.length
  );
}
export function isCalendarView(v: unknown) {
  return (
    record(v) &&
    exact(v, [
      "official",
      "fallback",
      "previous",
      "following",
      "utc",
      "checked",
      "updated",
      "invalidCache",
    ]) &&
    [v.official, v.fallback, v.previous].every(
      (s) => s === null || isCalendarSchedule(s),
    ) &&
    strings(v.following, calendarSeriesLimit) &&
    typeof v.utc === "boolean" &&
    number(v.checked, calendarTimestampLimit) &&
    number(v.updated, calendarTimestampLimit) &&
    typeof v.invalidCache === "boolean"
  );
}
export function isCalendarIcsView(v: unknown) {
  return record(v) && exact(v, ["calendar", "preparedHash", "entries", "total", "validUntil"]) &&
    typeof v.calendar === "string" && new TextEncoder().encode(v.calendar).length <= calendarIcsLimit &&
    v.calendar.startsWith("BEGIN:VCALENDAR\r\n") && v.calendar.endsWith("END:VCALENDAR\r\n") &&
    isCalendarRevision(v.preparedHash) && number(v.total, calendarIcsLimit) && isCalendarDate(v.validUntil) &&
    list(v.entries, 4, (entry) => record(entry) && exact(entry, ["seriesId", "start", "end", "summary", "track"]) && text(entry.seriesId) && entry.seriesId.trim().length > 0 && typeof entry.summary === "string" && !/[\u0000-\u001f\u007f]/u.test(entry.summary) && new TextEncoder().encode(entry.summary).length <= 2 * calendarTextLimit + 4 && text(entry.track) && number(entry.start, calendarTimestampLimit * 1000) && number(entry.end, calendarTimestampLimit * 1000) && entry.end >= entry.start) &&
    v.entries.length === Math.min(v.total, 4);
}
export function isRequest(v: Record<string, unknown>) {
  switch (v.method) {
    case "calendar.alertsSave":
      return (
        exact(v, ["method", "alerts", "expectedRevision"]) &&
        isCalendarAlerts(v.alerts) &&
        isCalendarRevision(v.expectedRevision)
      );
    case "calendar.icsPrepare":
      return exact(v, ["method", "scope", "alarm"]) && (v.scope === "favs" || v.scope === "events" || v.scope === "all") && typeof v.alarm === "boolean";
    case "calendar.icsExport":
      return exact(v, ["method", "preparedHash"]) && isCalendarRevision(v.preparedHash);
    case "calendar.load":
    case "calendar.refresh":
    case "calendar.configLoad":
    case "calendar.historyLoad":
      return exact(v, ["method"]);
    case "calendar.utcSet":
      return (
        exact(v, ["method", "utc", "expectedRevision"]) &&
        typeof v.utc === "boolean" &&
        isCalendarRevision(v.expectedRevision)
      );
    case "calendar.notifyWeekSet":
      return (
        exact(v, ["method", "enabled", "expectedRevision"]) &&
        typeof v.enabled === "boolean" &&
        isCalendarRevision(v.expectedRevision)
      );
    case "calendar.followSet":
      return (
        exact(v, ["method", "seriesId", "followed", "expectedRevision"]) &&
        text(v.seriesId) &&
        v.seriesId.trim().length > 0 &&
        typeof v.followed === "boolean" &&
        isCalendarRevision(v.expectedRevision)
      );
    default:
      return false;
  }
}
export function isReply(v: Record<string, unknown>) {
  if (v.method === "calendar.icsExport") return exact(v, ["method", "status"]) && (v.status === "saved" || v.status === "cancelled" || v.status === "conflict");
  if (!exact(v, ["method", "value"])) return false;
  switch (v.method) {
    case "calendar.icsPrepare":
      return isCalendarIcsView(v.value);
    case "calendar.historyLoad":
      return isCalendarHistory(v.value);
    case "calendar.load":
    case "calendar.refresh":
      return isCalendarView(v.value);
    case "calendar.alertsSave":
    case "calendar.configLoad":
    case "calendar.utcSet":
    case "calendar.notifyWeekSet":
    case "calendar.followSet":
      return isCalendarConfig(v.value);
    default:
      return false;
  }
}
export const isError = (v: Record<string, unknown>) =>
  (v.kind === "calendarScheduleUnavailable" || v.kind === "calendarExportTooLarge")
    ? exact(v, ["kind"])
    : v.kind === "calendarConflict" &&
      exact(v, ["kind", "current"]) &&
      isCalendarConfig(v.current);
export const isEvent = (_v: Record<string, unknown>) => false;
