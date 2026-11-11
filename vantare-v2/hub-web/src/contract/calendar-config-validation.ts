import {
  isCalendarRevision,
  list,
  number,
  strings,
  text,
} from "./calendar-common";
import {
  calendarAlertLeads,
  calendarBandModes,
  calendarBandsLimit,
  calendarDayMinutes,
  calendarDays,
  calendarDocumentStates,
  calendarSeriesLimit,
  calendarSlotsLimit,
  calendarTimestampLimit,
} from "./generated/calendar";
import { exact, oneOf, record } from "./validation-common";

export function isCalendarAlerts(v: unknown, writing = true) {
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
        typeof b.seriesId === "string" &&
        (!writing || (text(b.seriesId) && b.seriesId.trim().length > 0)) &&
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
        typeof s.seriesId === "string" &&
        (!writing || (text(s.seriesId) && s.seriesId.trim().length > 0)) &&
        (writing
          ? number(s.at, calendarTimestampLimit)
          : typeof s.at === "number" &&
            Number.isInteger(s.at) &&
            Math.abs(s.at) <= 2 ** 63),
    ) &&
    (!writing ||
      (new Set(v.bands.map((b) => (b as { seriesId: string }).seriesId))
        .size === v.bands.length &&
        new Set(
          v.slots.map((s) =>
            JSON.stringify([
              (s as { seriesId: string }).seriesId,
              (s as { at: number }).at,
            ]),
          ),
        ).size === v.slots.length))
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
      "documents",
    ]) &&
    typeof v.utc === "boolean" &&
    record(v.documents) &&
    exact(v.documents, ["prefs", "following", "alerts"]) &&
    [v.documents.prefs, v.documents.following, v.documents.alerts].every(
      (state) => oneOf(state, calendarDocumentStates),
    ) &&
    (v.documents.prefs === "ready"
      ? isCalendarRevision(v.prefsRevision)
      : v.prefsRevision === null) &&
    strings(v.following, calendarSeriesLimit) &&
    (v.documents.following === "ready"
      ? isCalendarRevision(v.followingRevision)
      : v.followingRevision === null) &&
    (v.documents.alerts === "ready"
      ? isCalendarRevision(v.alertsRevision)
      : v.alertsRevision === null) &&
    isCalendarAlerts(v.alerts, false)
  );
}
