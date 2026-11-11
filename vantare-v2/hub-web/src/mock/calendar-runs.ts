import type { CalendarRun } from "../renderer/screens/calendar/CalendarRun";

// Public capture data from native/hub/src/calendar/capture.rs, never real telemetry.
const samples = [
  ["2026-10-07T19:15:00Z", 4, 6, "2:01.384"],
  ["2026-10-07T18:45:00Z", 9, -2, null],
  ["2026-10-07T18:00:00Z", 6, 9, null],
  ["2026-10-06T20:30:00Z", 11, 7, null],
  ["2026-09-30T18:00:00Z", 8, 3, null],
  ["2026-09-30T19:00:00Z", 5, 4, null],
  ["2026-10-01T18:00:00Z", 7, 1, null],
  ["2026-10-01T18:30:00Z", 3, 5, null],
  ["2026-10-01T19:00:00Z", 9, -1, null],
  ["2026-10-03T18:00:00Z", 6, 2, null],
] as const;
export const calendarRuns: CalendarRun[] = samples.map(
  ([at, position, safetyTenths, bestLap]) => ({
    seriesId: "beginner-lmgt3-fixed",
    circuit: "Sebring",
    at: Date.parse(at),
    position,
    safetyTenths,
    bestLap,
  }),
);
