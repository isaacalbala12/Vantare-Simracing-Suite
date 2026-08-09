import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Calendar } from "../../calendar/calendar-types";
import { CalendarUpcomingView } from "./CalendarUpcomingView";

const now = new Date("2026-08-04T12:00:00Z");

function calendarWith(overrides: Partial<Calendar> = {}): Calendar {
  return {
    version: 1,
    timezone: "UTC",
    reminderMinutes: [],
    events: [],
    followedEventIds: [],
    followedSeriesIds: [],
    updated: "",
    series: [
      {
        id: "beginner-lmgt3-fixed",
        name: "LMGT3 Fixed",
        tier: "beginner",
        licenseLabel: "Bronze SR",
        track: "Bahrain (Outer)",
        vehicleClass: "LMGT3 Class",
        classes: [{ name: "LMGT3" }],
        setup: "fixed",
        durationMin: 20,
        splits: 20,
        assists: "High assists allowed",
        tyreWarmers: true,
        tyres: 8,
        recurrence: { kind: "interval", intervalMinutes: 15 },
      },
      {
        id: "weekly-le-mans-24h-scaled",
        name: "2.4h Le Mans",
        tier: "weekly",
        licenseLabel: "",
        track: "Le Mans (WEC)",
        vehicleClass: "Hypercar LMP2 (WEC) & LMGT3 classes",
        classes: [
          { name: "Hypercar" },
          { name: "LMP2", qualifier: "WEC" },
          { name: "LMGT3" },
        ],
        setup: "open",
        durationMin: 144,
        splits: 50,
        assists: "No assists allowed",
        tyreWarmers: false,
        tyres: 10,
        timeScale: 10,
        safetyRating: "SR S2",
        notes: ["Comprueba que tu equipo mueve parrillas grandes."],
        recurrence: { kind: "weekly-slots", days: ["Tue"], timesUTC: ["15:00"] },
      },
    ],
    seriesPreviews: [
      { seriesId: "beginner-lmgt3-fixed", scheduleLabel: "cada 15min", nextStarts: ["2026-08-04T12:04:00Z"] },
      { seriesId: "weekly-le-mans-24h-scaled", scheduleLabel: "15:00", nextStarts: ["2026-08-04T15:00:00Z"] },
    ],
    ...overrides,
  };
}

afterEach(cleanup);

describe("CalendarUpcomingView", () => {
  it("puts the soonest tier first, whatever its name", () => {
    render(<CalendarUpcomingView calendar={calendarWith()} timeZone="UTC" now={now} />);

    const sections = screen.getAllByTestId(/^calendar-upcoming-tier-/);
    expect(sections[0].getAttribute("data-testid")).toBe("calendar-upcoming-tier-beginner");
    expect(sections[1].getAttribute("data-testid")).toBe("calendar-upcoming-tier-weekly");
  });

  it("shows the time left, not just the start time", () => {
    render(<CalendarUpcomingView calendar={calendarWith()} timeZone="UTC" now={now} />);

    expect(
      screen.getByTestId("calendar-upcoming-countdown-beginner-lmgt3-fixed").textContent,
    ).toBe("4m 00s");
    expect(
      screen.getByTestId("calendar-upcoming-countdown-weekly-le-mans-24h-scaled").textContent,
    ).toBe("3h 00m");
  });

  it("renders every eligible class with its own restriction", () => {
    render(<CalendarUpcomingView calendar={calendarWith()} timeZone="UTC" now={now} />);

    const lmp2 = screen.getByTestId("calendar-upcoming-class-weekly-le-mans-24h-scaled-LMP2");
    expect(lmp2.textContent).toContain("LMP2");
    expect(lmp2.textContent).toContain("WEC");
    expect(
      screen.getByTestId("calendar-upcoming-class-weekly-le-mans-24h-scaled-Hypercar"),
    ).toBeTruthy();
  });

  it("surfaces the rules that change how the race is driven", () => {
    render(<CalendarUpcomingView calendar={calendarWith()} timeZone="UTC" now={now} />);

    const row = screen.getByTestId("calendar-upcoming-row-weekly-le-mans-24h-scaled");
    expect(row.textContent).toContain("10x");
    expect(row.textContent).toContain("SR S2");
    expect(screen.getByTestId("calendar-upcoming-note-weekly-le-mans-24h-scaled")).toBeTruthy();
  });

  it("marks a running race as such instead of counting down", () => {
    const calendar = calendarWith({
      seriesPreviews: [
        {
          seriesId: "beginner-lmgt3-fixed",
          scheduleLabel: "cada 15min",
          // Started ten minutes ago, twenty minute race: still running.
          nextStarts: ["2026-08-04T11:50:00Z"],
        },
      ],
    });
    render(<CalendarUpcomingView calendar={calendar} timeZone="UTC" now={now} />);

    expect(
      screen.getByTestId("calendar-upcoming-countdown-beginner-lmgt3-fixed").textContent,
    ).toBe("en curso");
  });

  it("drops races that have already finished", () => {
    const calendar = calendarWith({
      seriesPreviews: [
        {
          seriesId: "beginner-lmgt3-fixed",
          scheduleLabel: "cada 15min",
          nextStarts: ["2026-08-04T10:00:00Z"],
        },
      ],
    });
    render(<CalendarUpcomingView calendar={calendar} timeZone="UTC" now={now} />);

    expect(screen.queryByTestId("calendar-upcoming-row-beginner-lmgt3-fixed")).toBeNull();
  });

  it("explains itself when there is nothing scheduled", () => {
    const calendar = calendarWith({ series: [], seriesPreviews: [] });
    render(<CalendarUpcomingView calendar={calendar} timeZone="UTC" now={now} />);

    expect(screen.getByTestId("calendar-upcoming-empty")).toBeTruthy();
  });
});
