export const recordingGroups = ["today", "yesterday", "week", "older"] as const;
export type RecordingGroup = (typeof recordingGroups)[number];
export const recordingZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
const calendarDay = (ms: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(ms);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
};
/** Calendar days in the user's timezone, including 23/25-hour DST days. */
export function recordingGroup(
  startedAtMs: number,
  nowMs: number,
  timeZone = recordingZone(),
): RecordingGroup {
  const days =
    calendarDay(nowMs, timeZone) - calendarDay(startedAtMs, timeZone);
  return days === 0
    ? "today"
    : days === 1
      ? "yesterday"
      : days >= 2 && days < 7
        ? "week"
        : "older";
}
/** Find the next civil-day boundary, including a skipped or repeated DST hour. */
export function nextRecordingDay(ms: number, timeZone: string) {
  const day = calendarDay(ms, timeZone);
  let from = ms;
  let until = ms + 36 * 3_600_000;
  while (until - from > 1) {
    const middle = Math.floor((from + until) / 2);
    if (calendarDay(middle, timeZone) === day) from = middle;
    else until = middle;
  }
  return until;
}
