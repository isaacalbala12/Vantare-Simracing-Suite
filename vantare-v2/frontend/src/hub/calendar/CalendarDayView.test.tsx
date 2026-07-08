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
        startTime: "2026-07-02T18:00:00Z", // 18:00 UTC
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

  it("shows date title of selected day in Spanish", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z"); // July 2, 2026 is Jueves (Thursday)
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    expect(screen.getByTestId("calendar-day-title").textContent).toBe("jueves 2 Julio 2026");
  });

  it("highlights current day with today indicator and shows current time", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T14:32:00Z")); // Today is July 2, 2026, 14:32 UTC

    try {
      render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

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
      render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

      expect(screen.queryByTestId("calendar-today-indicator")).toBeNull();
      expect(screen.queryByTestId("calendar-now-indicator")).toBeNull();
      expect(screen.queryByTestId("calendar-now-line")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows prep-band header when a tier filter is active", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="beginner" />);

    // Prep-band header should show the interval summary for the filtered tier
    expect(screen.getByTestId("calendar-day-patterns")).toBeTruthy();
    expect(screen.getByText("Horario:")).toBeTruthy();
    expect(screen.getAllByText(/Bronce/).length).toBeGreaterThan(0);

    // Interval-series are now materialized as event cards in the timeline
    const allCards = screen.queryAllByTestId(/calendar-day-event-\d+/);
    const bronceCards = allCards.filter((card) => card.textContent?.includes("Serie Bronce"));
    expect(bronceCards.length).toBe(24); // 1 per hour × 24h (60min window)

    // The concrete event "Carrera Bronce Falsa" from an interval series should still be skipped
    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });


  it("renders weekly slot occurrences and materialized events in correct time, and ignores other days", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Special event "Carrera Especial" and weekly slot "Serie Semanal" should be present
    expect(screen.getAllByText(/Carrera Especial/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Serie Semanal/).length).toBeGreaterThanOrEqual(1);

    // Event of another day "Carrera Otro Día" should not be present
    expect(screen.queryByText(/Carrera Otro Día/)).toBeNull();
  });

  it("positions events vertically by start time and duration", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    // Find cards by text content instead of index
    const allCards = screen.getAllByTestId(/calendar-day-event-\d+/);
    const weeklyCard = allCards.find((card) => card.textContent?.includes("Serie Semanal"));
    const specialCard = allCards.find((card) => card.textContent?.includes("Carrera Especial"));
    expect(weeklyCard).toBeTruthy();
    expect(specialCard).toBeTruthy();

    // weekly starts at 09:00, special at 18:00
    const weeklyTop = parseFloat(weeklyCard!.style.top || "0");
    const specialTop = parseFloat(specialCard!.style.top || "0");
    expect(weeklyTop).toBeLessThan(specialTop);

    // Special event has duration 45 min, so its height should be proportional
    const specialHeight = parseFloat(specialCard!.style.height || "0");
    expect(specialHeight).toBeGreaterThan(40);
  });

  it("segments overlapping events side by side", () => {
    const overlapCalendar: Calendar = {
      ...mockCalendar,
      events: [
        ...mockCalendar.events,
        {
          id: "ev-overlap-1",
          title: "Carrera Solapada 1",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T18:00:00Z", // overlaps with Carrera Especial
          durationMin: 45,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };

    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={overlapCalendar} timeZone="UTC" />);

    // Two events starting at 18:00 should be split into two columns
    const cards = screen.getAllByTestId(/calendar-day-event-\d+/);
    const overlapping = cards.filter((card) => card.textContent?.includes("Carrera Especial") || card.textContent?.includes("Carrera Solapada 1"));
    expect(overlapping.length).toBe(2);

    const widths = overlapping.map((card) => parseFloat(card.style.width || "0"));
    expect(widths[0]).toBeLessThan(100);
    expect(widths[1]).toBeLessThan(100);
  });

  it("shows a tooltip with tier and time details on each event card", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" />);

    const allCards = screen.getAllByTestId(/calendar-day-event-\d+/);
    const eventCard = allCards.find((card) => card.textContent?.includes("Carrera Especial"));
    expect(eventCard).toBeTruthy();
    expect(eventCard!.getAttribute("title")).toContain("Carrera Especial");
    expect(eventCard!.getAttribute("title")).toContain("Especial");
  });

  it("does not show a cap indicator or hide events", () => {
    // Add many events in the same hour; they should all render (segmented) rather than being capped.
    const manyEventsCalendar: Calendar = {
      ...mockCalendar,
      events: [
        ...mockCalendar.events,
        {
          id: "ev-many-1",
          title: "Carrera Hora 1",
          sim: "lmu",
          track: "Monza",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:00:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-many-2",
          title: "Carrera Hora 2",
          sim: "lmu",
          track: "Spa",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:20:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
        {
          id: "ev-many-3",
          title: "Carrera Hora 3",
          sim: "lmu",
          track: "Le Mans",
          series: "series-special",
          sessionLabel: "",
          startTime: "2026-07-02T10:40:00Z",
          durationMin: 30,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };

    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={manyEventsCalendar} timeZone="UTC" />);

    const allCards = screen.getAllByTestId(/calendar-day-event-\d+/);
    const titles = allCards.map((card) => card.textContent).join(" ");
    expect(titles).toContain("Carrera Hora 1");
    expect(titles).toContain("Carrera Hora 2");
    expect(titles).toContain("Carrera Hora 3");
    expect(screen.queryByTestId("calendar-day-more")).toBeNull();
  });

  it("all mode shows compact tier lanes and renders daily interval cards", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="all" />);

    // Should show the pattern summaries header
    expect(screen.getByTestId("calendar-day-patterns")).toBeTruthy();

    // Interval events should now render as event cards in the timeline
    const allCards = screen.queryAllByTestId(/calendar-day-event-\d+/);
    const bronceCards = allCards.filter((card) => card.textContent?.includes("Serie Bronce"));
    expect(bronceCards.length).toBe(24); // 1 per hour × 24h
    const plataCards = allCards.filter((card) => card.textContent?.includes("Serie Plata"));
    expect(plataCards.length).toBe(24); // 1 per hour × 24h

    // Weekly and special events should still be visible
    expect(screen.getAllByText(/Carrera Especial/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Serie Semanal/).length).toBeGreaterThanOrEqual(1);
  });
  it("beginner mode shows beginner events and prep-band shows beginner cadence", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="beginner" />);

    // Interval events now render as event cards in the timeline
    const allCards = screen.queryAllByTestId(/calendar-day-event-\d+/);
    const bronceCards = allCards.filter((card) => card.textContent?.includes("Serie Bronce"));
    expect(bronceCards.length).toBe(24); // 1 per hour × 24h

    // Should NOT show intermediate (Plata) events
    const plataCards = allCards.filter((card) => card.textContent?.includes("Serie Plata"));
    expect(plataCards.length).toBe(0);

    // Prep-band shows the beginner cadence summary
    expect(screen.getByTestId("calendar-day-patterns")).toBeTruthy();
    expect(screen.getAllByText(/Bronce/).length).toBeGreaterThan(0);
  });

  it("weekly mode does not show daily interval series", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="weekly" />);

    // Should show weekly slot
    expect(screen.getAllByText(/Serie Semanal/).length).toBeGreaterThanOrEqual(1);

    // Should NOT show daily interval series
    const weeklyCards = screen.queryAllByTestId(/calendar-day-event-\d+/);
    const bronceInTimeline = weeklyCards.some((c) => c.textContent?.includes("Serie Bronce"));
    expect(bronceInTimeline).toBe(false);
  });

  it("special mode does not show daily interval series", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="special" />);

    // Should show special event
    expect(screen.getAllByText(/Carrera Especial/).length).toBeGreaterThanOrEqual(1);

    // Should NOT show daily interval series
    const specialCards = screen.queryAllByTestId(/calendar-day-event-\d+/);
    const bronceInTimeline = specialCards.some((c) => c.textContent?.includes("Serie Bronce"));
    expect(bronceInTimeline).toBe(false);
  });

  it("daily interval events backed by interval series are ignored even when present in calendar.events", () => {
    const anchorDate = new Date("2026-07-02T12:00:00Z");
    render(<CalendarDayView anchorDate={anchorDate} calendar={mockCalendar} timeZone="UTC" activeFilter="special" />);

    // "Carrera Bronce Falsa" is a calendar.event backed by an interval series — should be ignored
    expect(screen.queryByText("Carrera Bronce Falsa")).toBeNull();
  });
});
