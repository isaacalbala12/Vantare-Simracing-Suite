import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockSubscribe = vi.fn<(...args: unknown[]) => unknown>();
const mockRequest = vi.fn();

vi.mock("../../calendar/calendar-store", () => ({
  subscribeToCalendar: (cb: unknown) => mockSubscribe(cb),
  requestCalendar: () => mockRequest(),
}));

import { CalendarHeroUpcomingPanel } from "./CalendarHeroUpcomingPanel";
import { EMPTY_CALENDAR, type Calendar, type RaceSeries, type RaceSeriesPreview } from "../../calendar/calendar-types";

describe("CalendarHeroUpcomingPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state initially if calendar is null", () => {
    render(<CalendarHeroUpcomingPanel />);
    expect(screen.getByTestId("calendar-hero-upcoming-panel-empty")).toBeTruthy();
    expect(screen.getByText(/Calendario LMU no cargado/i)).toBeTruthy();
  });

  it("renders populated state when calendar is provided with tiers", () => {
    // We mock subscribeToCalendar to immediately call the callback with a mock calendar
    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s1", name: "Beginner Series", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" } as RaceSeries,
          { id: "s2", name: "Intermediate Series", tier: "intermediate", durationMin: 30, setup: "", track: "Spa", vehicleClass: "GTE" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-03T20:00:00Z"] } as RaceSeriesPreview,
          { seriesId: "s2", nextStarts: ["2026-07-03T21:00:00Z"] } as RaceSeriesPreview,
        ],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");

    render(<CalendarHeroUpcomingPanel now={fakeNow} />);

    expect(screen.getByTestId("calendar-hero-upcoming-panel")).toBeTruthy();

    // Check that Bronce and Plata are rendered with real data
    expect(screen.getByTestId("upcoming-card-beginner")).toBeTruthy();
    expect(screen.getByText(/Beginner Series/i)).toBeTruthy();

    expect(screen.getByTestId("upcoming-card-intermediate")).toBeTruthy();
    expect(screen.getByText(/Intermediate Series/i)).toBeTruthy();

    // Oro should be empty since we didn't mock advanced series
    expect(screen.getByTestId("upcoming-card-advanced-empty")).toBeTruthy();
  });

  it("renders Weekly card if a weekly series exists", () => {
    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s3", name: "Weekly LMH", tier: "weekly", durationMin: 60, setup: "", track: "Le Mans", vehicleClass: "Hypercar" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s3", nextStarts: ["2026-07-04T18:00:00Z"] } as RaceSeriesPreview,
        ],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");

    render(<CalendarHeroUpcomingPanel now={fakeNow} />);

    expect(screen.getByTestId("upcoming-card-weekly")).toBeTruthy();
    expect(screen.getByText(/WEC Weekly · Le Mans/i)).toBeTruthy();
  });
});
