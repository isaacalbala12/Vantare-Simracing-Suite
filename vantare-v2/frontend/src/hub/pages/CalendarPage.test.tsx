import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPage } from "./CalendarPage";

type Handler = (event: { data: unknown }) => void;

const { listeners, eventsOn, eventsEmit } = vi.hoisted(() => {
  const map = new Map<string, Handler[]>();
  const on = vi.fn((name: string, cb: Handler) => {
    const list = map.get(name) ?? [];
    list.push(cb);
    map.set(name, list);
    return vi.fn();
  });
  const emit = vi.fn();
  return { listeners: map, eventsOn: on, eventsEmit: emit };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Emit: eventsEmit,
  },
}));

const mockUseAccess = vi.fn(() => ({
  planLabel: "free",
  planStatus: "free",
  roles: [] as string[],
  isBlocked: false,
  isUnconfigured: false,
}));

vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

afterEach(() => {
  cleanup();
});

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of listeners.get(name) ?? []) {
      handler({ data });
    }
  });
}

function clearListeners() {
  listeners.clear();
}

describe("CalendarPage", () => {
  beforeEach(() => {
    clearListeners();
    eventsEmit.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
  });

  it("emits calendar:get on mount", () => {
    render(<CalendarPage />);
    expect(eventsEmit).toHaveBeenCalledWith("calendar:get", null);
  });

  it("shows loading state before calendar data arrives", () => {
    render(<CalendarPage />);
    expect(screen.getByTestId("calendar-loading")).toBeTruthy();
  });

  it("does not render removed sections", () => {
    render(<CalendarPage />);
    expect(screen.queryByText(/Calendario publicado por Vantare/i)).toBeNull();
    expect(screen.queryByText(/Horario semanal LMU/i)).toBeNull();
    expect(screen.queryByText(/Series oficiales/i)).toBeNull();
    expect(screen.queryByText(/Carreras pasadas/i)).toBeNull();
  });

  it("renders rail 'Próximas carreras'", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [],
        events: [],
        updated: "",
      },
    });
    const rail = screen.getByTestId("calendar-race-rail");
    expect(rail.textContent).toContain("Próximas carreras");
  });

  it("rail shows Bronce, Plata, Oro, Weekly from buildUpcomingRaceItems", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [
          { id: "s1", name: "Beginner Series", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" },
          { id: "s2", name: "Intermediate Series", tier: "intermediate", durationMin: 30, setup: "", track: "Spa", vehicleClass: "GTE" },
          { id: "s3", name: "Advanced Series", tier: "advanced", durationMin: 45, setup: "", track: "Le Mans", vehicleClass: "Hypercar" },
          { id: "s4", name: "WEC Weekly", tier: "weekly", durationMin: 60, setup: "", track: "Le Mans", vehicleClass: "Hypercar" },
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-02T20:00:00Z"] },
          { seriesId: "s2", nextStarts: ["2026-07-02T21:00:00Z"] },
          { seriesId: "s3", nextStarts: ["2026-07-02T22:00:00Z"] },
          { seriesId: "s4", nextStarts: ["2026-07-02T23:00:00Z"] },
        ],
        events: [],
        updated: "",
      },
    });

    // Check that rail cards are rendered
    expect(screen.getByTestId("rail-card-beginner")).toBeTruthy();
    expect(screen.getByTestId("rail-card-intermediate")).toBeTruthy();
    expect(screen.getByTestId("rail-card-advanced")).toBeTruthy();
    expect(screen.getByTestId("rail-card-weekly")).toBeTruthy();
  });

  it("renders toolbar and the upcoming view by default when calendar loaded", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [{ id: "s1", name: "S1", tier: "beginner" }],
        events: [],
        updated: "",
      },
    });
    expect(screen.getByTestId("calendar-toolbar")).toBeTruthy();
    // The series has no preview, so there is nothing to count down to; the
    // upcoming view still owns the screen and says so.
    expect(screen.getByTestId("calendar-upcoming-empty")).toBeTruthy();
    expect(screen.queryByTestId("calendar-month-view")).toBeNull();
  });

  it("switches between the upcoming and month views", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [{ id: "s1", name: "S1", tier: "beginner" }],
        events: [],
        updated: "",
      },
    });

    const monthBtn = screen.getByTestId("calendar-view-month");
    act(() => {
      fireEvent.click(monthBtn);
    });
    expect(screen.getByTestId("calendar-month-view")).toBeTruthy();
    expect(screen.queryByTestId("calendar-upcoming")).toBeNull();

    const upcomingBtn = screen.getByTestId("calendar-view-upcoming");
    act(() => {
      fireEvent.click(upcomingBtn);
    });
    expect(screen.queryByTestId("calendar-month-view")).toBeNull();
  });

  it("clicking a month day cell anchors that date without leaving the month", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [{ id: "s1", name: "S1", tier: "beginner" }],
        events: [],
        updated: "",
      },
    });

    act(() => {
      fireEvent.click(screen.getByTestId("calendar-view-month"));
    });

    const cell2 = screen.getByTestId("calendar-month-cell-2");
    act(() => {
      fireEvent.click(cell2);
    });

    // The day view is retired, so a day click anchors the date and the month
    // stays on screen instead of navigating somewhere that no longer exists.
    expect(screen.getByTestId("calendar-month-view")).toBeTruthy();
  });
});
