import { describe, expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import type {
  CalendarSchedule,
  CalendarView,
} from "../src/contract/generated/calendar";
import { publication, starts } from "../src/renderer/screens/calendar/schedule";

const schedule: CalendarSchedule = fixture;
describe("calendar UTC projection", () => {
  it("clamps intervals to the publication and excludes the right edge", () => {
    const from = Date.parse(schedule.validFrom),
      until = from + 60 * 60_000;
    const series = { ...schedule.series[0], startOffsetMinute: 5 };
    expect(starts(schedule, series, from - 60_000, until)).toEqual(
      [5, 20, 35, 50].map((m) => from + m * 60_000),
    );
    expect(
      starts(
        schedule,
        series,
        Date.parse(schedule.validUntil),
        Date.parse(schedule.validUntil) + 60_000,
      ),
    ).toEqual([]);
  });
  it("expands and deduplicates weekly UTC slots", () => {
    const from = Date.parse("2026-07-01T00:00:00Z");
    const series = {
      ...schedule.series[0],
      recurrence: {
        kind: "weekly-slots",
        intervalMinutes: 0,
        days: ["Wed"],
        timesUTC: ["02:00", "02:00", "23:00"],
      },
    };
    expect(starts(schedule, series, from, from + 24 * 60 * 60_000)).toEqual([
      from + 2 * 60 * 60_000,
      from + 23 * 60 * 60_000,
    ]);
  });
  it("keeps expired official data available as the last week", () => {
    const view: CalendarView = {
      official: schedule,
      previous: null,
      fallback: null,
      following: [],
      utc: false,
      checked: 0,
      updated: 0,
      invalidCache: false,
    };
    const projected = publication(view, Date.parse(schedule.validUntil));
    expect(projected.schedule).toBeNull();
    expect(projected.previous).toEqual(schedule);
  });
});
