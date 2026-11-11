import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import type {
  CalendarSchedule,
  CalendarView,
} from "../src/contract/generated/calendar";
import { publication, starts } from "../src/renderer/screens/calendar/schedule";

import { civilDay } from "../src/renderer/ui/calendarDate";

afterEach(() => vi.unstubAllEnvs());
const schedule: CalendarSchedule = fixture;
describe("calendar UTC projection", () => {
  it("clamps intervals to the publication and excludes the right edge", () => {
    const from = Date.parse(schedule.validFrom),
      until = from + 60 * 60_000;
    const series = { ...schedule.series[0], startOffsetMinute: 5 };
    expect(starts(schedule, series, from - 60_000, until, 100)).toEqual(
      [5, 20, 35, 50].map((m) => from + m * 60_000),
    );
    expect(
      starts(
        schedule,
        series,
        Date.parse(schedule.validUntil),
        Date.parse(schedule.validUntil) + 60_000,
        100,
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
    expect(
      starts(schedule, series, from, from + 24 * 60 * 60_000, 100),
    ).toEqual([from + 2 * 60 * 60_000, from + 23 * 60 * 60_000]);
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
    const projected = publication(
      view,
      Date.parse(schedule.validUntil),
      schedule.series.length,
    );
    expect(projected.schedule).toBeNull();
    expect(projected.previous).toEqual(schedule);
  });
});

it("uses civil midnights across 23 and 25 hour days", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  for (const [date, hours] of [
    ["2026-03-29T12:00:00Z", 23],
    ["2026-10-25T12:00:00Z", 25],
  ] as const) {
    const at = Date.parse(date);
    expect(civilDay(at, 1, false) - civilDay(at, 0, false)).toBe(
      hours * 60 * 60_000,
    );
    expect(civilDay(at, 1, true) - civilDay(at, 0, true)).toBe(
      24 * 60 * 60_000,
    );
  }
});
