import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CALENDAR, type Calendar, type RaceSeries } from "../../calendar/calendar-types";
import { mockCalendar } from "../calendar-visual-mock-data";
import { formatStartTime } from "../orbit/next-starts";
import { buildSeriesEntries, dayAnchor, dayRows, groupByHour, monthDays, timelineStart, weekRows } from "./races-orbit-model";

const seed = JSON.parse(readFileSync("../internal/calendar/seed/lmu-weekly-schedule.json", "utf8")) as {
  validFrom: string; validUntil: string; updated: string; series: RaceSeries[];
};
const document: Calendar = { ...EMPTY_CALENDAR, series: seed.series,
  schedule: { validFrom: seed.validFrom, validUntil: seed.validUntil, updated: seed.updated, source: "bundled" },
};
const interval = buildSeriesEntries({ ...mockCalendar,
  series: [{ ...mockCalendar.series![0], recurrence: { kind: "interval", intervalMinutes: 15 }, startOffsetMinute: 0 }],
  schedule: { validFrom: "2026-01-01T00:00:00Z", validUntil: "2027-02-01T00:00:00Z", updated: "2026-01-01T00:00:00Z", source: "bundled" },
});

describe("días locales y cobertura de slots", () => {
  it("incluye las doce salidas de la serie semanal del seed real", () => {
    const entries = buildSeriesEntries(document).filter((entry) => entry.engine.weeklyUTC?.length === 12);
    expect(entries.length).toBeGreaterThan(0);
    // Wednesday and both adjacent UTC dates are published for this series.
    const day = new Date(2026, 7, 26);
    const starts = dayRows(entries.slice(0, 1), day, day).flatMap((hour) => hour.events);
    expect(starts.length).toBe(12);
    expect(weekRows(entries.slice(0, 1), day, day)[0].cells[0].total).toBe(12);
  });

  it.each([new Date(2026, 2, 8), new Date(2026, 2, 29), new Date(2026, 9, 25), new Date(2026, 10, 1)])(
    "Día respeta sus medianoches en %s", (day) => {
      const end = dayAnchor(day, 1);
      const starts = dayRows(interval, day, day).flatMap((hour) => hour.events);
      expect(starts.length).toBe((end.getTime() - day.getTime()) / 900_000);
      expect(starts.every(({ at }) => at >= day && at < end)).toBe(true);
      expect(weekRows(interval, day, day)[0].cells[0].total).toBe(starts.length);
    },
  );

  it.each([new Date(2026, 2, 1), new Date(2026, 9, 1), new Date(2026, 10, 1), new Date(2028, 1, 1), new Date(2026, 11, 1)])(
    "Mes conserva 42 fechas únicas a medianoche en %s", (first) => {
      const today = new Date(first.getFullYear(), first.getMonth(), 26);
      const days = monthDays([], first, today);
      const keys = days.map(({ day }) => `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`);
      expect(new Set(keys).size).toBe(42);
      expect(days.every(({ day }) => day.getHours() === 0)).toBe(true);
      expect(days.filter((day) => day.today)).toHaveLength(1);
      if (first.getFullYear() === 2028) expect(days.some(({ day }) => day.getMonth() === 1 && day.getDate() === 29)).toBe(true);
    },
  );

  it.each([
    ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"],
    ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"],
  ])("distingue dos instantes incluso durante la hora repetida %s", (first, second) => {
    const a = new Date(first); const b = new Date(second);
    expect(formatStartTime(a)).not.toBe(formatStartTime(b));
    const groups = groupByHour([{ entry: interval[0], at: a }, { entry: interval[0], at: b }]);
    expect(groups).toHaveLength(2);
    expect(timelineStart(b).getTime()).toBe(b.getTime() - 30 * 60_000);
  });
});
