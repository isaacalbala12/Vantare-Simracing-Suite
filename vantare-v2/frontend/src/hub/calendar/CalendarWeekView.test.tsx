import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarWeekView } from "./CalendarWeekView";
import type { Calendar } from "../../calendar/calendar-types";

describe("CalendarWeekView", () => {
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
        startTime: "2026-07-02T18:00:00Z", // Thursday July 2, 2026
        durationMin: 45,
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
          days: ["Mon"], // Monday
          timesUTC: ["09:00"],
        },
      },
    ],
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 7 columns of week view", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z"); // Wednesday
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`calendar-week-column-${i}`)).toBeTruthy();
    }
  });

  it("checks that the week starts on Monday", () => {
    // July 1, 2026 is Wednesday.
    // The week for July 1st starts on June 29 (Monday).
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    // First cell (index 0) corresponds to June 29 (29)
    const cell0 = screen.getByTestId("calendar-week-day-num-0");
    expect(cell0.textContent).toBe("29");

    // Second cell (index 1) is June 30 (30)
    const cell1 = screen.getByTestId("calendar-week-day-num-1");
    expect(cell1.textContent).toBe("30");

    // Third cell (index 2) is July 1 (1)
    const cell2 = screen.getByTestId("calendar-week-day-num-2");
    expect(cell2.textContent).toBe("1");
  });

  it("displays the eyebrow title 'Vista semanal'", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.getByText("Vista semanal")).toBeTruthy();
  });

  it("highlights current day with active background and today indicator", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");

    // Mock today to be July 2, 2026 (Thursday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00Z"));

    try {
      render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

      // Monday June 29 is 0, Tue 30 is 1, Wed July 1 is 2, Thu July 2 is 3.
      const todayColumn = screen.getByTestId("calendar-week-column-3");
      expect(todayColumn.className).toContain("bg-vantare-red-500");
      expect(screen.getByTestId("calendar-today-indicator")).toBeTruthy();
      expect(screen.getByText("Hoy")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows compact daily pattern summaries for interval series and does not materialise them", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    // Bronce and Plata summaries should render in every column
    // Let's check column index 2 (July 1st)
    const intervalItem1 = screen.getByTestId("calendar-week-interval-2-0");
    expect(intervalItem1.textContent).toBe("Bronce · Cada 15 min");

    const intervalItem2 = screen.getByTestId("calendar-week-interval-2-1");
    expect(intervalItem2.textContent).toBe("Plata · Cada 20 min");

    // It should not render individual events for interval series (e.g. "Carrera Bronce Falsa")
    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });

  it("renders weekly slot occurrences and materialized events in the correct column", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    // July 2, 2026 is Thursday (column 3).
    // It should show "Carrera Especial".
    const col3 = screen.getByTestId("calendar-week-column-3");
    expect(col3.textContent).toContain("Carrera Especial");

    // Monday June 29 is column 0 (which has the weekly slot since Mon is Jun 29)
    // "Serie Semanal" (weekly slots series expanded occurrence).
    const col0 = screen.getByTestId("calendar-week-column-0");
    expect(col0.textContent).toContain("Serie Semanal");
  });

  it("caps elements and displays +N more indicator only for concrete items", () => {
    const extraEventsCalendar: Calendar = {
      ...mockCalendar,
      events: [
        ...mockCalendar.events,
        {
          id: "ev-special-2",
          title: "Carrera Especial 2",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-06-29T18:00:00Z", // Monday June 29
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-special-3",
          title: "Carrera Especial 3",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-06-29T19:00:00Z", // Monday June 29
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-special-4",
          title: "Carrera Especial 4",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-06-29T20:00:00Z", // Monday June 29
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        }
      ]
    };

    // On Monday June 29 (column 0), we will have:
    // - "Serie Semanal" (weekly occurrence)
    // - "Carrera Especial 2"
    // - "Carrera Especial 3"
    // - "Carrera Especial 4"
    // Total concrete = 4. With maxConcrete = 3, we show 2 + "+2 más".
    // PLUS the interval summaries (Bronce, Plata) which should remain visible!

    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={extraEventsCalendar} />);

    // Check column 0 (Monday June 29)
    const col0 = screen.getByTestId("calendar-week-column-0");
    expect(col0).toBeTruthy();
    expect(screen.getByTestId("calendar-week-more-0").textContent).toBe("+2 más");
    // Interval summaries should still be in column 0
    expect(screen.getByTestId("calendar-week-interval-0-0").textContent).toBe("Bronce · Cada 15 min");
    expect(screen.getByTestId("calendar-week-interval-0-1").textContent).toBe("Plata · Cada 20 min");
    // Concrete events that fit in the cap should be shown
    expect(screen.getByTestId("calendar-week-event-0-0").textContent).toContain("Serie Semanal");
    expect(screen.getByTestId("calendar-week-event-0-1").textContent).toContain("Carrera Especial 2");
  });
});
