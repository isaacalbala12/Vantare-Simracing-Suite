import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarMonthView } from "./CalendarMonthView";
import type { Calendar } from "../../calendar/calendar-types";

describe("CalendarMonthView", () => {
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
        startTime: "2026-07-02T18:00:00Z", // 2 July 2026 is Thursday
        durationMin: 45,
        registrationUrl: "",
        source: "test",
        notes: "",
      },
      {
        // Associated to an interval series: should be filtered out to avoid double listing
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

  it("renders monthly grid with 42 cells", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    for (let i = 0; i < 42; i++) {
      expect(screen.getByTestId(`calendar-month-cell-${i}`)).toBeTruthy();
    }
  });

  it("checks that the week starts on Monday", () => {
    // July 1, 2026 is Wednesday.
    // The grid for July 2026 will start on June 28 (Sunday).
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // First cell (index 0) should correspond to June 28 (28)
    const firstCellDay = screen.getByTestId("calendar-month-cell-day-0");
    expect(firstCellDay.textContent).toBe("28");

    // Second cell (index 1) is June 29 (29)
    const secondCellDay = screen.getByTestId("calendar-month-cell-day-1");
    expect(secondCellDay.textContent).toBe("29");

    // Third cell (index 2) is June 30 (30)
    const thirdCellDay = screen.getByTestId("calendar-month-cell-day-2");
    expect(thirdCellDay.textContent).toBe("30");
  });

  it("highlights current day and dims days outside current month", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");

    // Mock today to be July 15, 2026 (Wednesday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));

    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // July 15, 2026 inside July grid:
    // June 29 is cell 0, June 30 is cell 1, July 1 is cell 2.
    // July 15 is cell 2 + 14 = 16.
    const todayCell = screen.getByTestId("calendar-month-cell-16");
    expect(todayCell.className).toContain("border-vantare-red-500/50");

    // Check dimmed days (June 29 is not in July)
    const outsideCell = screen.getByTestId("calendar-month-cell-0");
    expect(outsideCell.className).toContain("opacity-35");

    // Check active month days are not dimmed (July 1 is cell 2)
    const insideCell = screen.getByTestId("calendar-month-cell-2");
    expect(insideCell.className).not.toContain("opacity-35");

    vi.useRealTimers();
  });

  it("shows interval patterns in a shared header, not inside every cell", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    const header = screen.getByTestId("calendar-month-patterns");
    expect(header).toBeTruthy();
    expect(screen.getByTestId("calendar-month-interval-0").textContent).toBe("Bronce · Cada 15 min · 15m");
    expect(screen.getByTestId("calendar-month-interval-1").textContent).toBe("Plata · Cada 20 min · 20m");

    // Cells should not contain full interval labels any more
    expect(screen.queryByTestId("calendar-cell-interval-2-0")).toBeNull();
    expect(screen.queryByTestId("calendar-cell-interval-2-1")).toBeNull();
  });

  it("does not materialize interval series as events", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });

  it("renders weekly slot occurrences and materialized events in the correct day", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // July 2, 2026 is Thursday (cell 3).
    // It should show "Carrera Especial" (materialized special event).
    const cell3 = screen.getByTestId("calendar-month-cell-3");
    expect(cell3.textContent).toContain("Carrera Especial");

    // Monday July 6, 2026 is cell 7.
    // "Serie Semanal" (weekly slots series expanded occurrence).
    const cell7 = screen.getByTestId("calendar-month-cell-7");
    expect(cell7.textContent).toContain("Serie Semanal");
  });

  it("caps concrete events to maxConcreteItemsPerDay and displays +N more indicator", () => {
    // Add enough special events on a single day to trigger the cap.
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
          startTime: "2026-07-06T18:00:00Z", // Monday July 6
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
          startTime: "2026-07-06T19:00:00Z", // Monday July 6
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
          startTime: "2026-07-06T20:00:00Z", // Monday July 6
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-special-5",
          title: "Carrera Especial 5",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-06T21:00:00Z", // Monday July 6
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };

    // On Monday July 6, 2026 (cell 7), we will have:
    // - "Serie Semanal" (weekly occurrence)
    // - "Carrera Especial 2"
    // - "Carrera Especial 3"
    // - "Carrera Especial 4"
    // - "Carrera Especial 5"
    // Total concrete items = 5. With maxConcreteItemsPerDay = 4, we show 4 + "+1 más".

    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarMonthView anchorDate={anchorDate} calendar={extraEventsCalendar} timeZone="UTC" />);

    const cell7 = screen.getByTestId("calendar-month-cell-7");
    expect(cell7).toBeTruthy();
    expect(screen.getByTestId("calendar-cell-more-7").textContent).toBe("+1 más");

    // Four concrete events should be visible
    expect(screen.getByTestId("calendar-cell-event-7-0").textContent).toContain("Carrera Especial 2");
    expect(screen.getByTestId("calendar-cell-event-7-1").textContent).toContain("Carrera Especial 3");
    expect(screen.getByTestId("calendar-cell-event-7-2").textContent).toContain("Carrera Especial 4");
    expect(screen.getByTestId("calendar-cell-event-7-3").textContent).toContain("Carrera Especial 5");

    // The cap hides nothing beyond the fifth event
    expect(screen.queryByText("Carrera Especial 6")).toBeNull();
  });

  it("calls onTierClick when a shared interval summary is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onTierClick = vi.fn();
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" onTierClick={onTierClick} />);

    const intervalItem = screen.getByTestId("calendar-month-interval-0");
    intervalItem.click();
    expect(onTierClick).toHaveBeenCalledWith("beginner");
  });

  it("calls onFilterSelect when a concrete event pill is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onFilterSelect = vi.fn();
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" onFilterSelect={onFilterSelect} />);

    const cell3 = screen.getByTestId("calendar-cell-event-3-0");
    cell3.click();
    expect(onFilterSelect).toHaveBeenCalledWith("special");
  });

  it("calls onDayClick with the cell date when a day cell is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onDayClick = vi.fn();
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" onDayClick={onDayClick} />);

    // Cell 2 is July 1 (Wednesday) — first day of the month
    const cell2 = screen.getByTestId("calendar-month-cell-2");
    cell2.click();

    expect(onDayClick).toHaveBeenCalledTimes(1);
    const calledDate = onDayClick.mock.calls[0][0] as Date;
    expect(calledDate.getFullYear()).toBe(2026);
    expect(calledDate.getMonth()).toBe(6); // July
    expect(calledDate.getDate()).toBe(1);
  });

  it("does not navigate to day view when clicking a concrete event pill (stopPropagation)", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onDayClick = vi.fn();
    const onFilterSelect = vi.fn();
    render(<CalendarMonthView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" onDayClick={onDayClick} onFilterSelect={onFilterSelect} />);

    // Cell 3 (July 2) has a special event pill
    const eventPill = screen.getByTestId("calendar-cell-event-3-0");
    eventPill.click();

    // onFilterSelect should be called (filter behavior)
    expect(onFilterSelect).toHaveBeenCalled();
    // onDayClick should NOT be called (stopPropagation prevents it)
    expect(onDayClick).not.toHaveBeenCalled();
  });
});
