import { describe, expect, it } from "vitest";
import { normaliseCalendar } from "./calendar-store";
import type { Calendar, RaceSeries, RaceSeriesPreview } from "./calendar-types";

describe("normaliseCalendar", () => {
  it("normalises missing series to empty array", () => {
    const input = { events: [] } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.series).toEqual([]);
  });

  it("preserves series when present", () => {
    const series: RaceSeries[] = [
      {
        id: "lmu-fixed",
        name: "LMU Fixed",
        tier: "beginner",
        licenseLabel: "Rookie",
        track: "Silverstone",
        vehicleClass: "GT3",
        setup: "Fixed",
        durationMin: 20,
        splits: 4,
        assists: "Auto",
        tyreWarmers: false,
        tyres: 4,
        recurrence: {
          kind: "interval",
          intervalMinutes: 30,
        },
      },
    ];
    const input = { events: [], series } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.series).toHaveLength(1);
    expect(result.series![0].id).toBe("lmu-fixed");
    expect(result.series![0].recurrence.kind).toBe("interval");
  });

  it("normalises missing followedSeriesIds to empty array", () => {
    const input = { events: [] } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.followedSeriesIds).toEqual([]);
  });

  it("preserves followedSeriesIds when present", () => {
    const input = {
      events: [],
      followedSeriesIds: ["lmu-fixed", "lmu-open"],
    } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.followedSeriesIds).toEqual(["lmu-fixed", "lmu-open"]);
  });

  it("normalises missing seriesPreviews to empty array", () => {
    const input = { events: [] } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.seriesPreviews).toEqual([]);
  });

  it("preserves seriesPreviews with nextStarts as strings", () => {
    const previews: RaceSeriesPreview[] = [
      {
        seriesId: "lmu-fixed",
        scheduleLabel: "Cada 30 min",
        nextStarts: ["2026-07-02T20:00:00+02:00", "2026-07-02T20:30:00+02:00"],
      },
    ];
    const input = { events: [], seriesPreviews: previews } as unknown as Calendar;
    const result = normaliseCalendar(input);
    expect(result.seriesPreviews).toHaveLength(1);
    expect(result.seriesPreviews![0].seriesId).toBe("lmu-fixed");
    expect(result.seriesPreviews![0].nextStarts).toEqual([
      "2026-07-02T20:00:00+02:00",
      "2026-07-02T20:30:00+02:00",
    ]);
  });
});
