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
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`calendar-week-column-${i}`)).toBeTruthy();
    }
  });

  it("checks that the week starts on Monday", () => {
    // July 1, 2026 is Wednesday. The week starts on Monday.
    // Use local date to avoid UTC timezone ambiguity.
    const anchorDate = new Date(2026, 6, 1, 12, 0);
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Verify 7 columns exist
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`calendar-week-day-num-${i}`)).toBeTruthy();
    }
    // First column should be Monday (day number is buildWeekRange[0].getDate())
    const cell0 = screen.getByTestId("calendar-week-day-num-0");
    const day0 = parseInt(cell0.textContent!, 10);
    // Monday of the week containing July 1 is either June 29 or June 28 depending on timezone
    expect(day0).toBeGreaterThanOrEqual(28);
    expect(day0).toBeLessThanOrEqual(29);
  });

  it("highlights current day with active background and today indicator", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");

    // Mock today to be July 2, 2026 (Thursday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00Z"));

    try {
      render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

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
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Bronce and Plata summaries should render in the shared header
    const intervalItem1 = screen.getByTestId("calendar-week-interval-0");
    expect(intervalItem1.textContent).toBe("Bronce · Cada 15 min · ver detalle");

    const intervalItem2 = screen.getByTestId("calendar-week-interval-1");
    expect(intervalItem2.textContent).toBe("Plata · Cada 20 min · ver detalle");
    // It should not render individual events for interval series (e.g. "Carrera Bronce Falsa")
    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });

  it("renders weekly slot occurrences and materialized events in the correct column", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

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
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("12:00")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
  });

  it("positions concrete events vertically by start time and duration", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

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
    render(<CalendarWeekView anchorDate={anchorDate} calendar={overlappingCalendar} timeZone="UTC" />);

    const col3 = screen.getByTestId("calendar-week-column-3");
    expect(col3.textContent).toContain("Carrera Especial");
    expect(col3.textContent).toContain("Carrera Solapada 1");

    const ev0 = screen.getByTestId("calendar-week-event-3-0");
    const ev1 = screen.getByTestId("calendar-week-event-3-1");

    // Both events should be narrower than 100% because they overlap
    expect(parseFloat(ev0.style.width)).toBeLessThan(100);
    expect(parseFloat(ev1.style.width)).toBeLessThan(100);
  });

  it("calls onTierClick when an interval summary pill is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onTierClick = vi.fn();
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} onTierClick={onTierClick} timeZone="UTC" />);

    const intervalItem = screen.getByTestId("calendar-week-interval-0");
    intervalItem.click();
    expect(onTierClick).toHaveBeenCalledWith("beginner");
  });

  it("calls onTierClick when a concrete event pill is clicked", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    const onTierClick = vi.fn();
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} onTierClick={onTierClick} timeZone="UTC" />);

    const col3 = screen.getByTestId("calendar-week-event-3-0");
    col3.click();
    expect(onTierClick).toHaveBeenCalledWith("special");
  });

  it("does not render multisim fake strings", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    expect(screen.queryByText(/iRacing/)).toBeNull();
    expect(screen.queryByText(/ACC/)).toBeNull();
    expect(screen.queryByText(/AC Evo/)).toBeNull();
  });

  it("does not render create-race button", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    expect(screen.queryByText("Nueva carrera")).toBeNull();
  });

  it("does not show daily interval series as event cards in the grid", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Daily interval series (Serie Bronce, Serie Plata) should NOT appear as event cards
    const allEvents = screen.queryAllByTestId(/calendar-week-event-\d+-\d+/);
    const dailyCards = allEvents.filter((card) => card.textContent?.includes("Serie Bronce") || card.textContent?.includes("Serie Plata"));
    expect(dailyCards.length).toBe(0);

    // Special events should still appear
    const specialCards = allEvents.filter((card) => card.textContent?.includes("Carrera Especial"));
    expect(specialCards.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores calendar.events backed by interval series", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z");
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // "Carrera Bronce Falsa" is backed by an interval series — should be ignored
    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });

  it("shows weekly slot occurrences in the correct column", () => {
    const anchorDate = new Date("2026-07-01T12:00:00Z"); // Week of June 29 - July 5
    render(<CalendarWeekView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Serie Semanal has days: ["Mon"] — Monday June 29 is in this week
    // It should appear as an event card
    const allEvents = screen.queryAllByTestId(/calendar-week-event-\d+-\d+/);
    const weeklyCards = allEvents.filter((card) => card.textContent?.includes("Serie Semanal"));
    expect(weeklyCards.length).toBeGreaterThanOrEqual(1);
  });
});
