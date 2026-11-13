import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";

it("constructs the armed start from the visible Madrid/UTC departure across both DST transitions", () => {
  // As in calendar-schedule.test: TZ must be fixed before Node starts.
  const rows = new URL(
    "../src/renderer/screens/calendar/rows.ts",
    import.meta.url,
  ).href;
  const dates = new URL("../src/renderer/ui/calendarDate.ts", import.meta.url)
    .href;
  const schedule = new URL(
    "../src/renderer/screens/calendar/schedule.ts",
    import.meta.url,
  ).href;
  const script = `import {nextRace} from ${JSON.stringify(rows)};
    import {clock,civilDay} from ${JSON.stringify(dates)};
    import {starts} from ${JSON.stringify(schedule)};
    const fixture=${JSON.stringify(fixture)};
    const cases=[
      ["2026-03-29T00:59:00Z","00:59"],
      ["2026-03-29T01:01:00Z","01:01"],
      ["2026-10-25T00:04:00Z","00:04"],
      ["2026-10-25T01:04:00Z","01:04"]
    ];
    const result=cases.map(([expected,time])=>{
      const now=Date.parse(expected)-240000;
      const from=civilDay(now,0,false), until=civilDay(now,1,false);
      const series={...fixture.series[0],recurrence:{kind:"weekly",days:["Sun"],timesUTC:[time]}};
      const document={...fixture,validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString(),series:[series]};
      const constructed=starts(document,series,from,until,100);
      const hero=nextRace(document,now,[series.id],100);
      // CalendarLiveView passes hero.at to onArm, while the visible button
      // formats that same instant minus three minutes (never reparses HH:MM).
      return {constructed, startAt:hero.at, departure:clock(hero.at,false), madrid:clock(hero.at-180000,false), utc:clock(hero.at-180000,true)};
    });
    process.stdout.write(JSON.stringify(result));`;
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: { ...process.env, TZ: "Europe/Madrid" },
      timeout: 5000,
      windowsHide: true,
    },
  );
  const datesUtc = [
    "2026-03-29T00:59:00Z",
    "2026-03-29T01:01:00Z",
    "2026-10-25T00:04:00Z",
    "2026-10-25T01:04:00Z",
  ];
  expect(JSON.parse(output)).toEqual(
    datesUtc.map((date, index) => ({
      constructed: [Date.parse(date)],
      startAt: Date.parse(date),
      departure: ["01:59", "03:01", "02:04", "02:04"][index],
      madrid: ["01:56", "01:58", "02:01", "02:01"][index],
      utc: ["00:56", "00:58", "00:01", "01:01"][index],
    })),
  );
});
