import { describe, it, expect } from "vitest";
import { buildUpcomingRaceItems } from "./calendar-upcoming";
import { EMPTY_CALENDAR, type Calendar, type RaceSeries, type RaceSeriesPreview, type RaceEvent } from "../../calendar/calendar-types";

describe("buildUpcomingRaceItems", () => {
  it("returns empty summary for empty calendar", () => {
    const summary = buildUpcomingRaceItems(EMPTY_CALENDAR, new Date("2026-07-03T10:00:00Z"));
    expect(summary.bronce).toBeNull();
    expect(summary.plata).toBeNull();
    expect(summary.oro).toBeNull();
    expect(summary.weekly).toBeNull();
    expect(summary.events).toEqual([]);
  });

  it("extracts nextStarts correctly for series", () => {
    const series: RaceSeries[] = [
      {
        id: "s1",
        name: "Beginner Series",
        tier: "beginner",
        licenseLabel: "",
        track: "Monza",
        vehicleClass: "GTE",
        setup: "Fixed",
        durationMin: 20,
        splits: 1,
        assists: "on",
        tyreWarmers: true,
        tyres: 1,
        recurrence: { kind: "interval" },
      },
    ];

    const previews: RaceSeriesPreview[] = [
      {
        seriesId: "s1",
        scheduleLabel: "Cada 20 min",
        nextStarts: [
          "2026-07-03T10:00:00Z", // Past
          "2026-07-03T10:20:00Z", // Active
          "2026-07-03T10:40:00Z", // Future
        ],
      },
    ];

    const calendar: Calendar = { ...EMPTY_CALENDAR, series, seriesPreviews: previews };
    const now = new Date("2026-07-03T10:25:00Z");

    const summary = buildUpcomingRaceItems(calendar, now);

    expect(summary.bronce).toBeTruthy();
    expect(summary.bronce?.isActive).toBe(true);
    expect(summary.bronce?.nextStart).toBe("2026-07-03T10:20:00Z");
  });

  it("picks the closest future start if none are active", () => {
    const series: RaceSeries[] = [
      {
        id: "s2",
        name: "Silver Series",
        tier: "intermediate",
        licenseLabel: "",
        track: "Spa",
        vehicleClass: "LMP2",
        setup: "Open",
        durationMin: 30,
        splits: 1,
        assists: "off",
        tyreWarmers: true,
        tyres: 1,
        recurrence: { kind: "interval" },
      },
    ];

    const previews: RaceSeriesPreview[] = [
      {
        seriesId: "s2",
        scheduleLabel: "Cada 30 min",
        nextStarts: [
          "2026-07-03T09:30:00Z", // Past
          "2026-07-03T11:00:00Z", // Future 1
          "2026-07-03T11:30:00Z", // Future 2
        ],
      },
    ];

    const calendar: Calendar = { ...EMPTY_CALENDAR, series, seriesPreviews: previews };
    const now = new Date("2026-07-03T10:25:00Z");

    const summary = buildUpcomingRaceItems(calendar, now);

    expect(summary.plata).toBeTruthy();
    expect(summary.plata?.isActive).toBe(false);
    expect(summary.plata?.nextStart).toBe("2026-07-03T11:00:00Z");
  });

  it("extracts concrete upcoming events from calendar.events", () => {
    const events: RaceEvent[] = [
      {
        id: "e1",
        title: "Past Event",
        sim: "lmu",
        track: "Le Mans",
        series: "",
        sessionLabel: "",
        startTime: "2026-07-03T08:00:00Z",
        durationMin: 60,
        registrationUrl: "",
        source: "",
        notes: "",
      },
      {
        id: "e2",
        title: "Active Event",
        sim: "lmu",
        track: "Le Mans",
        series: "",
        sessionLabel: "",
        startTime: "2026-07-03T10:00:00Z",
        durationMin: 60,
        registrationUrl: "",
        source: "",
        notes: "",
      },
      {
        id: "e3",
        title: "Future Event",
        sim: "lmu",
        track: "Le Mans",
        series: "",
        sessionLabel: "",
        startTime: "2026-07-03T12:00:00Z",
        durationMin: 60,
        registrationUrl: "",
        source: "",
        notes: "",
      },
    ];

    const calendar: Calendar = { ...EMPTY_CALENDAR, events };
    const now = new Date("2026-07-03T10:30:00Z");

    const summary = buildUpcomingRaceItems(calendar, now);

    expect(summary.events.length).toBe(2);
    expect(summary.events[0].name).toBe("Active Event");
    expect(summary.events[0].isActive).toBe(true);
    expect(summary.events[1].name).toBe("Future Event");
    expect(summary.events[1].isActive).toBe(false);
  });
});
