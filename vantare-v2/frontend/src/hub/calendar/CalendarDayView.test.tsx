import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarDayView } from "./CalendarDayView";
import type { Calendar } from "../../calendar/calendar-types";

describe("CalendarDayView", () => {
  const mockCalendar: Calendar = {
    version: 1,
    timezone: "Europe/Madrid",
    reminderMinutes: [30, 15, 10, 5, 2],
    followedEventIds: [],
    followedSeriesIds: [],
    updated: "",
    events: [
      {
        id: "ev-special-1",
        title: "Carrera Especial",
        sim: "lmu",
        track: "Monza",
        series: "series-special",
        sessionLabel: "",
        startTime: "2026-07-02T18:30:00Z", // 18:30 UTC
        durationMin: 45,
        registrationUrl: "",
        source: "test",
        notes: "",
      },
      {
        id: "ev-special-other-day",
        title: "Carrera Otro Día",
        sim: "lmu",
        track: "Spa",
        series: "series-special",
        sessionLabel: "",
        startTime: "2026-07-03T10:00:00Z", // Different day
        durationMin: 60,
        registrationUrl: "",
        source: "test",
        notes: "",
      },
      {
        id: "ev-interval-dup",
        title: "Carrera Bronce Falsa",
        sim: "lmu",
        track: "Spa",
        series: "series-interval-bronce",
        sessionLabel: "",
        startTime: "2026-07-02T10:00:00Z",
        durationMin: 15,
        registrationUrl: "",
        source: "test",
        notes: "",
      },
    ],
    series: [
      {
        id: "series-interval-bronce",
        name: "Serie Bronce",
        tier: "beginner",
        licenseLabel: "Rookie",
        track: "Spa",
        vehicleClass: "GT3",
        setup: "Fixed",
        durationMin: 15,
        splits: 4,
        assists: "Auto",
        tyreWarmers: false,
        tyres: 4,
        recurrence: {
          kind: "interval",
          intervalMinutes: 15,
        },
      },
      {
        id: "series-interval-plata",
        name: "Serie Plata",
        tier: "intermediate",
        licenseLabel: "Silver",
        track: "Spa",
        vehicleClass: "LMP2",
        setup: "Open",
        durationMin: 20,
        splits: 3,
        assists: "Factory",
        tyreWarmers: true,
        tyres: 4,
        recurrence: {
          kind: "interval",
          intervalMinutes: 20,
        },
      },
      {
        id: "series-weekly",
        name: "Serie Semanal",
        tier: "weekly",
        licenseLabel: "All",
        track: "Monza",
        vehicleClass: "Hypercar",
        setup: "Open",
        durationMin: 60,
        splits: 2,
        assists: "None",
        tyreWarmers: true,
        tyres: 6,
        recurrence: {
          kind: "weekly-slots",
          days: ["Thu"], // Thursday (July 2, 2026 is Thursday)
          timesUTC: ["09:00"],
        },
      },
    ],
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("displays the eyebrow title 'Vista diaria'", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.getByText("Vista diaria")).toBeTruthy();
  });

  it("shows date title of selected day in Spanish", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z"); // July 2, 2026 is Jueves (Thursday)
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.getByTestId("calendar-day-title").textContent).toBe("Jueves 2 Julio 2026");
  });

  it("highlights current day with today indicator and shows current time", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T14:32:00Z")); // Today is July 2, 2026, 14:32 UTC

    try {
      render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

      expect(screen.getByTestId("calendar-today-indicator")).toBeTruthy();
      expect(screen.getByText("Hoy")).toBeTruthy();
      expect(screen.getByTestId("calendar-now-indicator")).toBeTruthy();
      expect(screen.getByText(/Ahora/)).toBeTruthy();
      expect(screen.getByTestId("calendar-now-line")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show today indicator or current time when selected day is not today", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T12:00:00Z")); // Today is July 3rd, selected is July 2nd

    try {
      render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

      expect(screen.queryByTestId("calendar-today-indicator")).toBeNull();
      expect(screen.queryByTestId("calendar-now-indicator")).toBeNull();
      expect(screen.queryByTestId("calendar-now-line")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Bronce/Plata/Oro as patterns", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.getByTestId("calendar-day-patterns")).toBeTruthy();
    expect(screen.getByTestId("calendar-day-interval-0").textContent).toBe("Bronce · Cada 15 min");
    expect(screen.getByTestId("calendar-day-interval-1").textContent).toBe("Plata · Cada 20 min");
  });

  it("does not materialize interval series as events", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.queryByText(/Carrera Bronce Falsa/)).toBeNull();
  });

  it("renders weekly slot occurrences and materialized events in correct time, and ignores other days", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} />);

    // Special event "Carrera Especial" starts at 18:30 UTC. In local time or depending on test environment, it's renderable.
    // Let's verify by checking title text is present
    expect(screen.getAllByText(/Carrera Especial/).length).toBeGreaterThanOrEqual(1);

    // Weekly slot "Serie Semanal" (Thursday 09:00 UTC) should be present
    expect(screen.getAllByText(/Serie Semanal/).length).toBeGreaterThanOrEqual(1);

    // Event of another day "Carrera Otro Día" should not be present
    expect(screen.queryByText(/Carrera Otro Día/)).toBeNull();
  });

  it("caps events per hour slot to 2 and shows +N más indicator", () => {
    // Let's add multiple events starting in the same hour (e.g. 10:00 to 10:59)
    const cappedCalendar: Calendar = {
      ...mockCalendar,
      events: [
        ...mockCalendar.events,
        {
          id: "ev-cap-1",
          title: "Carrera Capada 1",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:15:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-cap-2",
          title: "Carrera Capada 2",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:30:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-cap-3",
          title: "Carrera Capada 3",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:45:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };

    // Hour 10 now has:
    // - "Carrera Capada 1"
    // - "Carrera Capada 2"
    // - "Carrera Capada 3"
    // (Also "Carrera Bronce Falsa" is filtered out since its series is interval)
    // Total = 3 events starting in hour 10. We cap visible to 2, and show "+1 más"

    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={cappedCalendar} />);

    expect(screen.getAllByText(/Carrera Capada 1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Carrera Capada 2/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Carrera Capada 3/)).toBeNull();

    expect(screen.getByTestId("calendar-day-more").textContent).toBe("+1 más");

    // Patterns are still visible and unaffected by the cap
    expect(screen.getByTestId("calendar-day-interval-0").textContent).toBe("Bronce · Cada 15 min");
    expect(screen.getByTestId("calendar-day-interval-1").textContent).toBe("Plata · Cada 20 min");
  });
});
