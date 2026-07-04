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
    expect(screen.getByText("Próximas carreras")).toBeTruthy();
    expect(screen.getByTestId("calendar-race-rail")).toBeTruthy();
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

  it("renders toolbar and month view by default when calendar loaded", () => {
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
    expect(screen.getByTestId("calendar-month-view")).toBeTruthy();
  });

  it("switches to week and day views", () => {
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

    const weekBtn = screen.getByTestId("calendar-view-btn-week");
    act(() => {
      fireEvent.click(weekBtn);
    });
    expect(screen.getByTestId("calendar-week-view")).toBeTruthy();
    expect(screen.queryByTestId("calendar-month-view")).toBeNull();

    const dayBtn = screen.getByTestId("calendar-view-btn-day");
    act(() => {
      fireEvent.click(dayBtn);
    });
    expect(screen.getByTestId("calendar-day-view")).toBeTruthy();
    expect(screen.queryByTestId("calendar-week-view")).toBeNull();
  });

  it("does not render import UI or create-race button", () => {
    render(<CalendarPage />);
    expect(screen.queryByText(/Importar calendario/i)).toBeNull();
    expect(screen.queryByText(/Borrar calendario/i)).toBeNull();
    expect(screen.queryByText(/Nueva carrera/i)).toBeNull();
    expect(screen.queryByTestId("calendar-new-race-btn")).toBeNull();
    expect(screen.getByText(/Filtros/i)).toBeTruthy();
  });

  it("does not render multisim or fake data strings", () => {
    render(<CalendarPage />);
    expect(screen.queryByText(/iRacing/i)).toBeNull();
    expect(screen.queryByText(/ACC/)).toBeNull();
    expect(screen.queryByText(/AC Evo/i)).toBeNull();
    expect(screen.queryByText(/precios/i)).toBeNull();
    expect(screen.queryByText(/votos/i)).toBeNull();
    expect(screen.queryByText(/SR/)).toBeNull();
    expect(screen.queryByText(/DR/)).toBeNull();
  });

  it("filters rail by tier when filter is selected", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        series: [
          { id: "s1", name: "Beginner Series", tier: "beginner", durationMin: 20, setup: "", track: "Monza", vehicleClass: "GT3" },
          { id: "s2", name: "Intermediate Series", tier: "intermediate", durationMin: 30, setup: "", track: "Spa", vehicleClass: "GTE" },
          { id: "s3", name: "Advanced Series", tier: "advanced", durationMin: 45, setup: "", track: "Le Mans", vehicleClass: "Hypercar" },
        ],
        seriesPreviews: [
          { seriesId: "s1", nextStarts: ["2026-07-02T20:00:00Z"] },
          { seriesId: "s2", nextStarts: ["2026-07-02T21:00:00Z"] },
          { seriesId: "s3", nextStarts: ["2026-07-02T22:00:00Z"] },
        ],
        events: [],
        updated: "",
      },
    });

    act(() => {
      fireEvent.click(screen.getByTestId("calendar-filter-toggle"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-filter-beginner"));
    });

    expect(screen.getByTestId("rail-card-beginner")).toBeTruthy();
    expect(screen.queryByTestId("rail-card-intermediate")).toBeNull();
    expect(screen.queryByTestId("rail-card-advanced")).toBeNull();
    expect(screen.getByTestId("calendar-active-filter")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByTestId("calendar-clear-filter"));
    });
    expect(screen.queryByTestId("calendar-active-filter")).toBeNull();
  });

  it("opens detail panel when clicking a rail card and closes panel", () => {
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

    act(() => {
      fireEvent.click(screen.getByTestId("rail-card-beginner"));
    });

    expect(screen.getByTestId("calendar-race-detail-panel")).toBeTruthy();
    expect(screen.getByTestId("calendar-detail-panel-title").textContent).toBe("Bronce");
    expect(screen.getByTestId("calendar-active-filter")).toBeTruthy();

    // Close panel
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-detail-panel-close-btn"));
    });

    expect(screen.queryByTestId("calendar-race-detail-panel")).toBeNull();
    // Filter remains active after closing panel
    expect(screen.getByTestId("calendar-active-filter")).toBeTruthy();

    // Clear filter separately
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-clear-filter"));
    });
    expect(screen.queryByTestId("calendar-active-filter")).toBeNull();
  });
});
