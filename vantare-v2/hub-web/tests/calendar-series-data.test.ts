import { expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import {
  seriesHistory,
  slotGroups,
} from "../src/renderer/screens/calendar/series";

const series = fixture.series.find(
  (series) => series.recurrence.kind === "interval",
);
if (!series) throw new Error("fixture must include a daily series");
const from = Date.parse(fixture.validFrom),
  until = Date.parse(fixture.validUntil);
it("counts only this series inside the published week, with GPUI integer rounding", () => {
  const run = {
    seriesId: series.id,
    circuit: series.track,
    at: from,
    bestLap: "2:01.384",
    position: 4,
    safetyTenths: 6,
  };
  expect(
    seriesHistory(
      [
        run,
        { ...run, position: 9, safetyTenths: -2 },
        { ...run, position: 6, safetyTenths: 9 },
        { ...run, position: 11, safetyTenths: 7 },
        { ...run, at: until },
        { ...run, seriesId: "other" },
      ],
      series.id,
      from,
      until,
    ),
  ).toEqual({ count: "4 carreras", best: "2:01.384", mean: "P7 · +2 SR" });
  expect(seriesHistory([], series.id, from, until)).toEqual({
    count: "Ninguna",
    best: "—",
    mean: "—",
  });
});
it("keeps a post-midnight departure with the previous race day until 03:00", () => {
  const groups = slotGroups(
    [
      "2026-10-08T22:00:00Z",
      "2026-10-09T02:30:00Z",
      "2026-10-09T03:00:00Z",
    ].map(Date.parse),
    Date.parse("2026-10-08T12:00:00Z"),
    true,
  );
  expect(groups.map((group) => group.label)).toEqual(["hoy", "mañana"]);
  expect(groups.map((group) => group.starts.length)).toEqual([2, 1]);
});
