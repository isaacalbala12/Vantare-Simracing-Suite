import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import type {
  CalendarSchedule,
  CalendarView,
} from "../src/contract/generated/calendar";
import { days } from "../src/renderer/screens/calendar/days";
import { board, nextRace } from "../src/renderer/screens/calendar/rows";
import { publication, starts } from "../src/renderer/screens/calendar/schedule";

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
  // TZ must be set before Node starts: changing it in a worker thread is platform dependent.
  const source = new URL("../src/renderer/ui/calendarDate.ts", import.meta.url)
    .href;
  const script = `import {civilDay} from ${JSON.stringify(source)};
    const values = ["2026-03-29T12:00:00Z","2026-10-25T12:00:00Z"].map(date => {
      const at = Date.parse(date);
      return [false,true].map(utc => (civilDay(at,1,utc)-civilDay(at,0,utc))/3600000);
    }); process.stdout.write(JSON.stringify(values));`;
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    {
      env: { ...process.env, TZ: "Europe/Madrid" },
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    },
  );
  expect(JSON.parse(output)).toEqual([
    [23, 24],
    [25, 24],
  ]);
});

it("orders favorites by the next departure and keeps other series out of the hero", () => {
  const first = {
    ...schedule.series[0],
    id: "favorite-later",
    name: "Later",
    startOffsetMinute: 10,
  };
  const second = {
    ...schedule.series[0],
    id: "favorite-sooner",
    name: "Sooner",
    startOffsetMinute: 5,
  };
  const other = {
    ...schedule.series[0],
    id: "not-followed",
    name: "Other",
    startOffsetMinute: 0,
  };
  const sample = { ...schedule, series: [first, second, other] };
  const now = Date.parse(sample.validFrom);
  const following = [first.id, second.id];
  const rows = board(sample, now, following, 100);
  expect(rows.favorites.map((r) => r.series.id)).toEqual([second.id, first.id]);
  expect(rows.rest.map((r) => r.series.id)).toEqual([other.id]);
  const hero = nextRace(sample, now, following, 100);
  expect(hero?.series.id).toBe(second.id);
  expect(hero?.after.every((r) => following.includes(r.series.id))).toBe(true);
  expect(
    hero?.after.some((r) => r.series.id === second.id && r.time > hero.at),
  ).toBe(true);
  expect(nextRace(sample, now, [], 100)).toBeUndefined();
});

it("groups only followed series or alert bands, clamps today and omits uncovered bands", () => {
  const now = Date.parse(schedule.validFrom) + 12 * 60 * 60_000;
  const sample = {
    ...schedule,
    validUntil: new Date(now + 12 * 60 * 60_000).toISOString(),
    series: [schedule.series[0]],
  };
  const alerts = {
    leadMin: 10,
    bands: [],
    slots: [],
    channels: { windows: true, inTrack: true, sound: false },
    autoLaunch: false,
    notifyWeek: true,
  };
  expect(days(sample, now, true, [], alerts, 100)).toEqual([]);
  const open = days(sample, now, true, [sample.series[0].id], alerts, 100);
  expect(open).toHaveLength(1);
  expect(open[0].entries[0].kind).toBe("open");
  expect(open[0].entries[0].starts).toHaveLength(1);
  expect(open[0].entries[0].starts[0]).toBeGreaterThanOrEqual(now);
  const band = {
    seriesId: sample.series[0].id,
    from: new Date(now + 60 * 60_000).getHours() * 60,
    to: (new Date(now + 60 * 60_000).getHours() + 1) * 60,
    days: "all" as const,
    mode: "each" as const,
  };
  const covered = days(
    sample,
    now,
    true,
    [],
    { ...alerts, bands: [band] },
    100,
  );
  expect(covered[0].entries[0].kind).toBe("band");
  expect(covered[0].entries[0].starts).toHaveLength(4);
  expect(
    days(
      sample,
      now,
      true,
      [],
      {
        ...alerts,
        bands: [
          {
            ...band,
            from: (new Date(now).getHours() - 2) * 60,
            to: (new Date(now).getHours() - 1) * 60,
          },
        ],
      },
      100,
    ),
  ).toEqual([]);
});

it("omits over-limit expansions instead of rendering a partial agenda or throwing", () => {
  const from = Date.parse(schedule.validFrom),
    until = from + 3600000;
  expect(starts(schedule, schedule.series[0], from, until, 3)).toEqual([]);
  expect(starts(schedule, schedule.series[0], from, until, 4)).toHaveLength(4);
});
