import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CalendarRaceDetailDrawer } from "./CalendarRaceDetailDrawer";
import type { Calendar } from "../../calendar/calendar-types";

const mockCalendar: Calendar = {
  version: 1,
  timezone: "UTC",
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
      startTime: "2026-07-02T18:00:00Z",
      durationMin: 45,
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
      recurrence: { kind: "interval", intervalMinutes: 15 },
    },
    {
      id: "series-special",
      name: "Serie Especial",
      tier: "special",
      licenseLabel: "All",
      track: "Monza",
      vehicleClass: "Hypercar",
      setup: "Open",
      durationMin: 45,
      splits: 2,
      assists: "None",
      tyreWarmers: true,
      tyres: 6,
      recurrence: { kind: "weekly-slots", days: ["Thu"], timesUTC: ["09:00"] },
    },
  ],
  seriesPreviews: [
    { seriesId: "series-interval-bronce", scheduleLabel: "Cada 15 min", nextStarts: ["2026-07-02T10:00:00Z"] },
    { seriesId: "series-special", scheduleLabel: "Jueves 09:00", nextStarts: ["2026-07-02T18:00:00Z"] },
  ],
};

describe("CalendarRaceDetailDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders drawer with tier label and upcoming race", () => {
    render(
      <CalendarRaceDetailDrawer
        tier="beginner"
        calendar={mockCalendar}
        anchorDate={new Date("2026-07-02T12:00:00Z")}
        onClose={vi.fn()}
        onClearFilter={vi.fn()}
      />
    );

    expect(screen.getByTestId("calendar-race-detail-drawer")).toBeTruthy();
    expect(screen.getByTestId("calendar-detail-drawer-title").textContent).toBe("Bronce");
    expect(screen.getByTestId("calendar-detail-drawer-upcoming-item")).toBeTruthy();
  });

  it("closes drawer when overlay is clicked", () => {
    const onClose = vi.fn();
    render(
      <CalendarRaceDetailDrawer
        tier="special"
        calendar={mockCalendar}
        anchorDate={new Date("2026-07-02T12:00:00Z")}
        onClose={onClose}
        onClearFilter={vi.fn()}
      />
    );

    const drawer = screen.getByTestId("calendar-race-detail-drawer");
    fireEvent.click(drawer);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClearFilter when clicking quitar filtro", () => {
    const onClearFilter = vi.fn();
    render(
      <CalendarRaceDetailDrawer
        tier="weekly"
        calendar={mockCalendar}
        anchorDate={new Date("2026-07-02T12:00:00Z")}
        onClose={vi.fn()}
        onClearFilter={onClearFilter}
      />
    );

    fireEvent.click(screen.getByTestId("calendar-detail-drawer-clear-filter"));
    expect(onClearFilter).toHaveBeenCalled();
  });
});
