export const recordingGroups = ["today", "yesterday", "week", "older"] as const;
export type RecordingGroup = (typeof recordingGroups)[number];
const calendarDay = (ms: number) => {
  const date = new Date(ms);
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
};
/** Calendar days in the user's timezone, including 23/25-hour DST days. */
export function recordingGroup(
  startedAtMs: number,
  nowMs: number,
): RecordingGroup {
  const days = calendarDay(nowMs) - calendarDay(startedAtMs);
  return days === 0
    ? "today"
    : days === 1
      ? "yesterday"
      : days >= 2 && days < 7
        ? "week"
        : "older";
}
