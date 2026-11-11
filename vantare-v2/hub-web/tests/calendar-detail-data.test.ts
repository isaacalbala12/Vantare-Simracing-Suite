import { expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import {
  detailDepartures,
  detailPhases,
} from "../src/renderer/screens/calendar/detail";

const series = fixture.series.find(
  (series) => series.recurrence.kind === "interval",
);
if (!series) throw new Error("daily fixture required");
it("offers ten future published daily departures and none after expiry", () => {
  const now = Date.parse(fixture.validFrom) + 1;
  const times = detailDepartures(fixture, series, now, 4096);
  expect(times).toHaveLength(10);
  expect(
    times.every((at) => at >= now && at < Date.parse(fixture.validUntil)),
  ).toBe(true);
  expect(
    detailDepartures(fixture, series, Date.parse(fixture.validUntil), 4096),
  ).toEqual([]);
});
it("keeps the exact session lengths while limiting the phase bar proportions", () => {
  const source = {
    ...series,
    sessions: [
      { name: "practice", durationMin: 2, estimated: true },
      { name: "qualifying", durationMin: 8, estimated: true },
      { name: "race", durationMin: 120, estimated: false },
    ],
  };
  expect(detailPhases(source, 0)).toEqual({
    minutes: [2, 8, 120],
    weights: [4, 8, 60],
    raceAt: 600_000,
    endAt: 7_800_000,
  });
  expect(detailPhases(source, undefined).raceAt).toBeUndefined();
  expect(detailPhases(source, undefined).endAt).toBeUndefined();
});
