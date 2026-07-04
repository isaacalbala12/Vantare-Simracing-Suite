import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockSubscribe = vi.fn<(...args: unknown[]) => unknown>();
const mockRequest = vi.fn();

vi.mock("../../calendar/calendar-store", () => ({
  subscribeToCalendar: (cb: unknown) => mockSubscribe(cb),
  requestCalendar: () => mockRequest(),
}));

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
}));
vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: mockEmit },
}));

const mockUseAccess = vi.fn(() => ({
  planLabel: "free",
  planStatus: "free",
  roles: ["tester"],
  isBlocked: false,
  isUnconfigured: false,
}));
vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

import { CalendarRaceRail } from "./CalendarRaceRail";
import * as calendarUpcoming from "./calendar-upcoming";
import { EMPTY_CALENDAR, type Calendar, type RaceSeries, type RaceSeriesPreview } from "../../calendar/calendar-types";

describe("CalendarRaceRail", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders loading/empty state initially", () => {
    render(<CalendarRaceRail />);
    expect(screen.getByText(/Próximas carreras/i)).toBeTruthy();
    expect(screen.getByText(/Cargando/i)).toBeTruthy();
  });

  it("renders populated state when calendar is provided with tiers", () => {
    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s1", name: "Beginner Series", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" } as RaceSeries,
          { id: "s3", name: "Weekly LMH", tier: "weekly", durationMin: 60, setup: "", track: "Le Mans", vehicleClass: "Hypercar" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-03T20:00:00Z"] } as RaceSeriesPreview,
          { seriesId: "s3", nextStarts: ["2026-07-04T18:00:00Z"] } as RaceSeriesPreview,
        ],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    expect(screen.getByTestId("calendar-race-rail")).toBeTruthy();
    expect(screen.getByTestId("rail-card-weekly")).toBeTruthy();
    expect(screen.getByTestId("rail-card-beginner")).toBeTruthy();

    // Check that intermediate and advanced are not rendered because they are missing
    expect(screen.queryByTestId("rail-card-intermediate")).toBeNull();
    expect(screen.queryByTestId("rail-card-advanced")).toBeNull();
  });

  it("rail shows Seguir action and emits calendar:series:follow", () => {
    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s1", name: "Beginner", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-03T20:00:00Z"] } as RaceSeriesPreview,
        ],
        followedSeriesIds: [],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    const followBtn = screen.getByTestId("rail-follow-btn-s1");
    expect(followBtn).toBeTruthy();
    expect(followBtn.textContent).toContain("Seguir");
    expect(followBtn.getAttribute("aria-label")).toBe("Seguir Beginner");
    expect(followBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(followBtn);
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:follow", { seriesId: "s1" });
  });

  it("rail shows Siguiendo/Dejar action and emits calendar:series:unfollow", () => {
    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s1", name: "Beginner", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-03T20:00:00Z"] } as RaceSeriesPreview,
        ],
        followedSeriesIds: ["s1"],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    const followBtn = screen.getByTestId("rail-follow-btn-s1");
    expect(followBtn).toBeTruthy();
    expect(followBtn.textContent).toContain("Siguiendo");
    expect(followBtn.getAttribute("aria-label")).toBe("Dejar de seguir Beginner");
    expect(followBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(followBtn);
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:unfollow", { seriesId: "s1" });
  });

  it("rail handles event-based follow/unfollow when item kind is event", () => {
    const spy = vi.spyOn(calendarUpcoming, "buildUpcomingRaceItems").mockReturnValue({
      bronce: {
        id: "ev-1",
        kind: "event",
        tier: "event",
        name: "Test Event",
        track: "Monza",
        vehicleClass: "GT3",
        setup: "",
        durationMin: 60,
        nextStart: "2026-07-03T20:00:00Z",
        isActive: false,
      },
      plata: null,
      oro: null,
      weekly: null,
      events: [],
    });

    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      callback({ kind: "loaded", calendar: { ...EMPTY_CALENDAR, followedEventIds: [] } });
      return vi.fn();
    });

    render(<CalendarRaceRail />);

    const followBtn = screen.getByTestId("rail-follow-btn-ev-1");
    fireEvent.click(followBtn);
    expect(mockEmit).toHaveBeenCalledWith("calendar:follow", { eventId: "ev-1" });

    spy.mockRestore();
  });

  it("weekly rail shows Seguir action with accessible name and aria-pressed", () => {
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
        followedSeriesIds: [],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    const weeklyBtn = screen.getByTestId("rail-follow-btn-s3");
    expect(weeklyBtn).toBeTruthy();
    expect(weeklyBtn.textContent).toContain("Seguir");
    expect(weeklyBtn.getAttribute("aria-label")).toBe("Seguir Weekly LMH");
    expect(weeklyBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(weeklyBtn);
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:follow", { seriesId: "s3" });
  });

  it("weekly rail shows Siguiendo Dejar action with accessible name and aria-pressed", () => {
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
        followedSeriesIds: ["s3"],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    const weeklyBtn = screen.getByTestId("rail-follow-btn-s3");
    expect(weeklyBtn).toBeTruthy();
    expect(weeklyBtn.textContent).toContain("Siguiendo");
    expect(weeklyBtn.textContent).toContain("Dejar");
    expect(weeklyBtn.getAttribute("aria-label")).toBe("Dejar de seguir Weekly LMH");
    expect(weeklyBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(weeklyBtn);
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:unfollow", { seriesId: "s3" });
  });

  it("does not render follow button for item with empty id", () => {
    const spy = vi.spyOn(calendarUpcoming, "buildUpcomingRaceItems").mockReturnValue({
      bronce: {
        id: "",
        kind: "series",
        tier: "beginner",
        name: "No ID Series",
        track: "Monza",
        vehicleClass: "GT3",
        setup: "",
        durationMin: 20,
        nextStart: "2026-07-03T20:00:00Z",
        isActive: false,
      },
      plata: null,
      oro: null,
      weekly: null,
      events: [],
    });

    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      callback({ kind: "loaded", calendar: { ...EMPTY_CALENDAR } });
      return vi.fn();
    });

    render(<CalendarRaceRail />);

    expect(screen.getByTestId("rail-card-beginner")).toBeTruthy();
    expect(screen.queryByTestId("rail-follow-btn-")).toBeNull();
    expect(screen.queryByRole("button", { name: /Seguir|Dejar/ })).toBeNull();

    spy.mockRestore();
  });

  it("shows locked state for free user without followReminders", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "free",
      planStatus: "free",
      roles: [],
      isBlocked: false,
      isUnconfigured: false,
    });

    mockSubscribe.mockImplementationOnce((cb: unknown) => {
      const callback = cb as (state: { kind: "loaded"; calendar: Calendar }) => void;
      const mockCalendar: Calendar = {
        ...EMPTY_CALENDAR,
        series: [
          { id: "s1", name: "Beginner", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" } as RaceSeries,
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-03T20:00:00Z"] } as RaceSeriesPreview,
        ],
        followedSeriesIds: [],
      };
      callback({ kind: "loaded", calendar: mockCalendar });
      return vi.fn();
    });

    const fakeNow = () => new Date("2026-07-03T18:00:00Z");
    render(<CalendarRaceRail now={fakeNow} />);

    expect(screen.getByTestId("rail-follow-locked-s1")).toBeTruthy();
    expect(screen.queryByTestId("rail-follow-btn-s1")).toBeNull();
    expect(screen.getByText("Bloqueado")).toBeTruthy();
  });
});
