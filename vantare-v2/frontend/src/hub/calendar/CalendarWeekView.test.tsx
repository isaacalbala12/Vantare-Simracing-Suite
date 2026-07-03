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

    // Bronce and Plata summaries should render in the shared header
    const intervalItem1 = screen.getByTestId("calendar-week-interval-0");
    expect(intervalItem1.textContent).toBe("Bronce · Cada 15 min");

    const intervalItem2 = screen.getByTestId("calendar-week-interval-1");
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

  it("renders an hour axis on the left side", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("12:00")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
  });

  it("positions concrete events vertically by start time and duration", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    const event = screen.getByTestId("calendar-week-event-3-0");
    expect(event.textContent).toContain("Carrera Especial");
    const startDate = new Date("2026-07-02T18:00:00Z");
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    expect(event.style.top).toBe(`${(startMinutes / 60) * 52}px`);
    expect(event.style.height).toBe(`${(45 / 60) * 52}px`);
  });

  it("segments overlapping events side-by-side in the same column", () => {
    const overlappingCalendar: Calendar = {
      ...mockCalendar,
      events: [
        ...mockCalendar.events,
        {
          id: "ev-overlap-1",
          title: "Carrera Solapada 1",
          sim: "lmu",
          track: "Spa",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T18:15:00Z", // overlaps with ev-special-1 at 18:00
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };

    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={overlappingCalendar} />);

    const col3 = screen.getByTestId("calendar-week-column-3");
    expect(col3.textContent).toContain("Carrera Especial");
    expect(col3.textContent).toContain("Carrera Solapada 1");

    const ev0 = screen.getByTestId("calendar-week-event-3-0");
    const ev1 = screen.getByTestId("calendar-week-event-3-1");

    // Both events should be narrower than 100% because they overlap
    expect(parseFloat(ev0.style.width)).toBeLessThan(100);
    expect(parseFloat(ev1.style.width)).toBeLessThan(100);
  });

  it("calls onFilterSelect when an interval summary pill is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onFilterSelect = vi.fn();
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} onFilterSelect={onFilterSelect} />);

    const intervalItem = screen.getByTestId("calendar-week-interval-0");
    intervalItem.click();
    expect(onFilterSelect).toHaveBeenCalledWith("beginner");
  });

  it("calls onFilterSelect when a concrete event pill is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onFilterSelect = vi.fn();
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} onFilterSelect={onFilterSelect} />);

    const col3 = screen.getByTestId("calendar-week-event-3-0");
    col3.click();
    expect(onFilterSelect).toHaveBeenCalledWith("special");
  });

  it("does not render multisim fake strings", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.queryByText(/iRacing/)).toBeNull();
    expect(screen.queryByText(/ACC/)).toBeNull();
    expect(screen.queryByText(/AC Evo/)).toBeNull();
  });

  it("does not render create-race button", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} />);

    expect(screen.queryByText("Nueva carrera")).toBeNull();
  });
});
