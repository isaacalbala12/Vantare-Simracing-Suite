import { list, number, strings, text } from "./calendar-common";
import {
  calendarAlertLeads,
  calendarBandModes,
  calendarBandsLimit,
  calendarDayMinutes,
  calendarDays,
  calendarRevisionLength,
  calendarSeriesLimit,
  calendarSlotsLimit,
  calendarTimestampLimit,
} from "./generated/calendar";
import { exact, oneOf, record } from "./validation-common";

const revision = (v: unknown) =>
  typeof v === "string" &&
  v.length === calendarRevisionLength &&
  /^[0-9a-f]+$/u.test(v);
export function isCalendarAlerts(v: unknown) {
  return (
    record(v) &&
    exact(v, [
      "leadMin",
      "bands",
      "slots",
      "channels",
      "autoLaunch",
      "notifyWeek",
    ]) &&
    calendarAlertLeads.some((n) => n === v.leadMin) &&
    typeof v.autoLaunch === "boolean" &&
    typeof v.notifyWeek === "boolean" &&
    record(v.channels) &&
    exact(v.channels, ["windows", "inTrack", "sound"]) &&
    [v.channels.windows, v.channels.inTrack, v.channels.sound].every(
      (n) => typeof n === "boolean",
    ) &&
    list(
      v.bands,
      calendarBandsLimit,
      (b) =>
        record(b) &&
        exact(b, ["seriesId", "from", "to", "days", "mode"]) &&
        text(b.seriesId) &&
        b.seriesId.trim().length > 0 &&
        number(b.from, calendarDayMinutes) &&
        number(b.to, calendarDayMinutes) &&
        b.from < b.to &&
        oneOf(b.days, calendarDays) &&
        oneOf(b.mode, calendarBandModes),
    ) &&
    list(
      v.slots,
      calendarSlotsLimit,
      (s) =>
        record(s) &&
        exact(s, ["seriesId", "at"]) &&
        text(s.seriesId) &&
        s.seriesId.trim().length > 0 &&
        number(s.at, calendarTimestampLimit),
    )
  );
}
export function isCalendarConfig(v: unknown) {
  return (
    record(v) &&
    exact(v, [
      "utc",
      "prefsRevision",
      "following",
      "followingRevision",
      "alerts",
      "alertsRevision",
    ]) &&
    typeof v.utc === "boolean" &&
    revision(v.prefsRevision) &&
    strings(v.following, calendarSeriesLimit) &&
    revision(v.followingRevision) &&
    revision(v.alertsRevision) &&
    isCalendarAlerts(v.alerts)
  );
}
