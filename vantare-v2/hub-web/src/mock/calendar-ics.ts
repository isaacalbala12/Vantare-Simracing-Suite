import type {
  CalendarConfigView,
  CalendarIcsScope,
  CalendarIcsView,
  CalendarView,
} from "../contract/generated/calendar";
import {
  calendarIcsLimit,
  calendarSeriesLimit,
  calendarStartsLimit,
} from "../contract/generated/calendar";
import {
  alertAt,
  leadMinutes,
  raceMinutes,
} from "../renderer/screens/calendar/rows";
import { publication, starts } from "../renderer/screens/calendar/schedule";

const stamp = (at: number) =>
  new Date(at)
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
const escapeText = (text: string) =>
  text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n");
function line(text: string) {
  let out = "",
    length = 0;
  for (const c of text) {
    const bytes = new TextEncoder().encode(c).length;
    if (length + bytes > 75) {
      out += "\r\n ";
      length = 1;
    }
    out += c;
    length += bytes;
  }
  return `${out}\r\n`;
}
export function mockCalendarIcs(
  view: CalendarView,
  config: CalendarConfigView,
  scope: CalendarIcsScope,
  alarm: boolean,
  now: number,
):
  | CalendarIcsView
  | "calendarScheduleUnavailable"
  | "calendarExportTooLarge"
  | "protected"
  | "io" {
  const schedule = publication(view, now, calendarSeriesLimit).schedule;
  if (!schedule) return "calendarScheduleUnavailable";
  const states = [
    ...(scope === "favs" ? [config.documents.following] : []),
    ...(alarm || scope !== "events" ? [config.documents.alerts] : []),
  ];
  if (states.includes("protected")) return "protected";
  if (states.includes("unavailable")) return "io";
  const records: Array<{
    entry: CalendarIcsView["entries"][number];
    text: string;
  }> = [];
  const header =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vantare//Calendario LMU//ES\r\nCALSCALE:GREGORIAN\r\n";
  const footer = "END:VCALENDAR\r\n";
  let bytes = new TextEncoder().encode(header + footer).length;
  for (const series of schedule.series) {
    const isDaily = series.recurrence.kind === "interval";
    if (
      (scope === "favs" && !config.following.includes(series.id)) ||
      (scope === "events" && isDaily)
    )
      continue;
    for (const at of starts(
      schedule,
      series,
      now,
      Date.parse(schedule.validUntil),
      calendarStartsLimit,
    )) {
      if (
        isDaily &&
        !alertAt(schedule, series, at, config.alerts, calendarStartsLimit)
      )
        continue;
      const entry = {
        seriesId: series.id,
        start: at,
        end:
          at +
          (series.eventDurationMin ??
            leadMinutes(series) + raceMinutes(series)) *
            60000,
        summary: `${series.name} · ${series.track.split(" (")[0]}`,
        track: series.track,
      };
      let text =
        "BEGIN:VEVENT\r\n" +
        line(`UID:${escapeText(series.id)}-${Math.floor(at / 1000)}@vantare`) +
        `DTSTAMP:${stamp(now)}\r\nDTSTART:${stamp(at)}\r\nDTEND:${stamp(entry.end)}\r\n` +
        line(`SUMMARY:${escapeText(entry.summary)}`) +
        line(`LOCATION:${escapeText(entry.track)}`);
      if (alarm)
        text +=
          "BEGIN:VALARM\r\nACTION:DISPLAY\r\n" +
          line(`DESCRIPTION:${escapeText(entry.summary)}`) +
          `TRIGGER:-PT${config.alerts.leadMin}M\r\nEND:VALARM\r\n`;
      text += "END:VEVENT\r\n";
      bytes += new TextEncoder().encode(text).length;
      if (bytes > calendarIcsLimit) return "calendarExportTooLarge";
      records.push({ entry, text });
    }
  }
  records.sort((a, b) => a.entry.start - b.entry.start);
  const calendar = header + records.map((r) => r.text).join("") + footer;
  return {
    calendar,
    preparedHash: "a".repeat(64),
    entries: records.slice(0, 4).map((r) => r.entry),
    total: records.length,
    validUntil: schedule.validUntil,
  };
}
