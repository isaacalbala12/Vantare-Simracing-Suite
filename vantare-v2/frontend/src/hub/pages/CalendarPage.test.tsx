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

function event(overrides: Record<string, unknown>) {
  return {
    id: "cal-1",
    title: "Race",
    sim: "lmu",
    track: "Le Mans",
    series: "",
    sessionLabel: "",
    startTime: "2026-07-02T20:00:00Z",
    durationMin: 60,
    registrationUrl: "",
    source: "unit-test",
    notes: "",
    ...overrides,
  };
}

describe("CalendarPage", () => {
  beforeEach(() => {
    clearListeners();
    eventsEmit.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
  });

  it("renders heading", () => {
    render(<CalendarPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Carreras LMU" })).toBeTruthy();
  });

  it("emits calendar:get on mount", () => {
    render(<CalendarPage />);
    expect(eventsEmit).toHaveBeenCalledWith("calendar:get", null);
  });

  it("does not render import UI", () => {
    render(<CalendarPage />);
    expect(screen.queryByTestId("calendar-import-textarea")).toBeNull();
    expect(screen.queryByTestId("calendar-import-btn")).toBeNull();
    expect(screen.queryByTestId("calendar-clear-btn")).toBeNull();
    expect(screen.queryByTestId("calendar-timezone-input")).toBeNull();
    expect(screen.queryByTestId("calendar-source-input")).toBeNull();
    expect(screen.queryByText(/discord-lmu-week/)).toBeNull();
  });

  it("shows informative block about published calendar", () => {
    render(<CalendarPage />);
    expect(screen.getByText("Calendario publicado por Vantare")).toBeTruthy();
    expect(screen.getByText("No necesitas importar nada manualmente. Cuando publiquemos una actualización semanal, las carreras aparecerán aquí.")).toBeTruthy();
  });

  it("shows timezone as informative text", () => {
    render(<CalendarPage />);
    expect(screen.getByText(/Zona horaria:/)).toBeTruthy();
    expect(screen.getByText(/local/)).toBeTruthy();
  });

  it("shows timezone from calendar when loaded", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "Europe/Madrid",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [],
        updated: "",
      },
    });
    expect(screen.getByText("Zona horaria: Europe/Madrid")).toBeTruthy();
  });

  it("shows empty upcoming state with Vantare explanation when no calendar", () => {
    render(<CalendarPage />);
    expect(screen.getByText("No hay carreras próximas publicadas.")).toBeTruthy();
    expect(screen.getByText("Vantare actualizará el calendario LMU desde nuevas versiones de la app.")).toBeTruthy();
  });

  it("shows empty upcoming state with Vantare explanation when calendar loaded but empty", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [],
        updated: "",
      },
    });
    expect(screen.getByText("No hay carreras próximas publicadas.")).toBeTruthy();
    expect(screen.getByText("Vantare actualizará el calendario LMU desde nuevas versiones de la app.")).toBeTruthy();
  });

  it("shows empty past state", () => {
    render(<CalendarPage />);
    expect(screen.getByText("No hay carreras pasadas todavía.")).toBeTruthy();
  });

  it("shows upcoming events when calendar:loaded arrives", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ id: "a", startTime: "2026-07-02T20:00:00Z", title: "Race 1" }),
          event({ id: "b", startTime: "2026-07-03T18:00:00Z", title: "Race 2" }),
        ],
        updated: "",
      },
    });
    const items = screen.getAllByTestId("calendar-upcoming-event");
    expect(items.length).toBe(2);
    expect(screen.getByText("Race 1")).toBeTruthy();
    expect(screen.getByText("Race 2")).toBeTruthy();
  });

  it("shows past events when calendar:loaded arrives with past events", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ id: "a", startTime: "2026-06-30T08:00:00Z", durationMin: 60, title: "Past Race" }),
        ],
        updated: "",
      },
    });
    const items = screen.getAllByTestId("calendar-past-event");
    expect(items.length).toBe(1);
    expect(screen.getByText("Past Race")).toBeTruthy();
  });

  it("shows error message when calendar:error arrives", () => {
    render(<CalendarPage />);
    dispatch("calendar:error", { message: "Error de prueba" });
    expect(screen.getByTestId("calendar-error")).toBeTruthy();
    expect(screen.getByText("Error de prueba")).toBeTruthy();
  });

  it("does not render prohibited fake strings", () => {
    render(<CalendarPage />);
    expect(screen.queryByText(/Sebring/)).toBeNull();
    expect(screen.queryByText(/COTA/)).toBeNull();
    expect(screen.queryByText(/Paul Ricard/)).toBeNull();
    expect(screen.queryByText(/discord-lmu-week/)).toBeNull();
  });

  it("shows Seguir carrera button on upcoming event not followed", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z" })],
        followedEventIds: [],
        updated: "",
      },
    });
    expect(screen.getByTestId("calendar-follow-btn-ev-1")).toBeTruthy();
    expect(screen.getByText("Seguir carrera")).toBeTruthy();
  });

  it("click Seguir carrera emits calendar:follow with eventId", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z" })],
        followedEventIds: [],
        updated: "",
      },
    });
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-follow-btn-ev-1"));
    });
    expect(eventsEmit).toHaveBeenCalledWith("calendar:follow", { eventId: "ev-1" });
  });

  it("shows Siguiendo badge and Dejar de seguir when event is followed", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z" })],
        followedEventIds: ["ev-1"],
        updated: "",
      },
    });
    expect(screen.getByTestId("calendar-following-badge-ev-1")).toBeTruthy();
    expect(screen.getByText("Siguiendo")).toBeTruthy();
    expect(screen.getByTestId("calendar-unfollow-btn-ev-1")).toBeTruthy();
    expect(screen.getByText("Dejar de seguir")).toBeTruthy();
  });

  it("click Dejar de seguir emits calendar:unfollow with eventId", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z" })],
        followedEventIds: ["ev-1"],
        updated: "",
      },
    });
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-unfollow-btn-ev-1"));
    });
    expect(eventsEmit).toHaveBeenCalledWith("calendar:unfollow", { eventId: "ev-1" });
  });

  it("does not show follow buttons on past events", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-06-30T08:00:00Z", durationMin: 60 })],
        followedEventIds: [],
        updated: "",
      },
    });
    expect(screen.queryByTestId("calendar-follow-btn-ev-1")).toBeNull();
    expect(screen.queryByTestId("calendar-following-badge-ev-1")).toBeNull();
    expect(screen.queryByTestId("calendar-unfollow-btn-ev-1")).toBeNull();
  });

  it("shows Activa ahora badge when event is active", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-01T11:30:00Z", durationMin: 120, title: "Active Race" })],
        followedEventIds: [],
        updated: "",
      },
    });
    expect(screen.getByText("Activa ahora")).toBeTruthy();
  });

  it("shows Activa ahora badge alongside Siguiendo when active and followed", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-01T11:30:00Z", durationMin: 120, title: "Active Followed" })],
        followedEventIds: ["ev-1"],
        updated: "",
      },
    });
    expect(screen.getByText("Activa ahora")).toBeTruthy();
    expect(screen.getByText("Siguiendo")).toBeTruthy();
  });

  it("shows duration when event has durationMin", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z", durationMin: 90, title: "Long Race" })],
        followedEventIds: [],
        updated: "",
      },
    });
    expect(screen.getByText(/90 min/)).toBeTruthy();
  });

  it("shows Finalizada badge on past events", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-06-30T08:00:00Z", durationMin: 60, title: "Past Race" })],
        followedEventIds: [],
        updated: "",
      },
    });
    expect(screen.getByTestId("calendar-finished-badge-ev-1")).toBeTruthy();
    expect(screen.getByText("Finalizada")).toBeTruthy();
  });

  it("past events have reduced opacity", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-06-30T08:00:00Z", durationMin: 60, title: "Past Race" })],
        followedEventIds: [],
        updated: "",
      },
    });
    const card = screen.getByTestId("calendar-past-event");
    expect(card.className).toContain("opacity-70");
  });

  it("shows followed event with red border glow", () => {
    render(<CalendarPage />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z", title: "Followed Race" })],
        followedEventIds: ["ev-1"],
        updated: "",
      },
    });
    const card = screen.getByTestId("calendar-upcoming-event");
    expect(card.className).toContain("border-vantare-red");
  });

  describe("series rendering", () => {
    function seriesPayload(overrides: Record<string, unknown> = {}) {
      return {
        calendar: {
          version: 1,
          timezone: "UTC",
          reminderMinutes: [30, 15, 10, 5, 2],
          events: [],
          series: [
            {
              id: "lmu-fixed",
              name: "LMU Fixed",
              tier: "beginner",
              licenseLabel: "Rookie",
              track: "Silverstone",
              vehicleClass: "GT3",
              setup: "Fixed",
              durationMin: 20,
              splits: 4,
              assists: "Auto",
              tyreWarmers: false,
              tyres: 4,
              recurrence: { kind: "interval", intervalMinutes: 30 },
            },
            {
              id: "lmu-open",
              name: "LMU Open",
              tier: "intermediate",
              licenseLabel: "Silver",
              track: "Spa",
              vehicleClass: "LMP2",
              setup: "Open",
              durationMin: 45,
              splits: 3,
              assists: "Factory",
              tyreWarmers: true,
              tyres: 4,
              recurrence: { kind: "interval", intervalMinutes: 20 },
            },
            {
              id: "lmu-pro",
              name: "LMU Pro",
              tier: "advanced",
              licenseLabel: "Gold",
              track: "Monza",
              vehicleClass: "Hypercar",
              setup: "Open",
              durationMin: 60,
              splits: 2,
              assists: "None",
              tyreWarmers: true,
              tyres: 6,
              recurrence: { kind: "interval", intervalMinutes: 15 },
            },
            {
              id: "lmu-weekly",
              name: "LMU Weekly",
              tier: "weekly",
              licenseLabel: "All",
              track: "Nürburgring",
              vehicleClass: "GT3",
              setup: "Fixed",
              durationMin: 30,
              splits: 6,
              assists: "Auto",
              tyreWarmers: false,
              tyres: 4,
              recurrence: { kind: "weekly-slots", days: ["Wed"], timesUTC: ["02:00"] },
            },
          ],
          seriesPreviews: [
            { seriesId: "lmu-fixed", scheduleLabel: "Cada 30 min", nextStarts: ["2026-07-02T20:00:00Z"] },
            { seriesId: "lmu-open", scheduleLabel: "Cada 20 min", nextStarts: ["2026-07-02T20:20:00Z"] },
            { seriesId: "lmu-pro", scheduleLabel: "Cada 15 min", nextStarts: ["2026-07-02T20:15:00Z"] },
            { seriesId: "lmu-weekly", scheduleLabel: "Wed 02:00", nextStarts: ["2026-07-02T02:00:00Z"] },
          ],
          followedSeriesIds: [],
          updated: "",
          ...overrides,
        },
      };
    }

    it("renders Bronce/Plata/Oro/Weekly tier groups when series arrive", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.getByText("Bronce")).toBeTruthy();
      expect(screen.getByText("Plata")).toBeTruthy();
      expect(screen.getByText("Oro")).toBeTruthy();
      expect(screen.getByText("Weekly")).toBeTruthy();
    });

    it("renders Cada 15 min, Cada 20 min, Cada 30 min schedule labels", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      // Each label appears at least once: in the group header badge + inside the series card
      expect(screen.getAllByText("Cada 15 min").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Cada 20 min").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Cada 30 min").length).toBeGreaterThanOrEqual(1);
    });

    it("renders weekly label with Wed and 02:00", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.getByText("Wed 02:00")).toBeTruthy();
    });

    it("renders next start times from seriesPreviews", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.getByText("2026-07-02T20:00:00Z")).toBeTruthy();
      expect(screen.getByText("2026-07-02T20:15:00Z")).toBeTruthy();
      expect(screen.getByText("2026-07-02T20:20:00Z")).toBeTruthy();
      expect(screen.getByText("2026-07-02T02:00:00Z")).toBeTruthy();
    });

    it("does not render legacy event rows when series are present", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.queryByTestId("calendar-upcoming-event")).toBeNull();
      expect(screen.queryByTestId("calendar-past-event")).toBeNull();
    });

    it("shows legacy upcoming events when series is empty", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", {
        calendar: {
          version: 1,
          timezone: "UTC",
          reminderMinutes: [30, 15, 10, 5, 2],
          events: [event({ id: "ev-1", startTime: "2026-07-02T20:00:00Z", title: "Legacy Race" })],
          series: [],
          seriesPreviews: [],
          followedSeriesIds: [],
          updated: "",
        },
      });
      expect(screen.getByTestId("calendar-upcoming-event")).toBeTruthy();
      expect(screen.getByText("Legacy Race")).toBeTruthy();
    });

    it("does not render import UI when series are present", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.queryByTestId("calendar-import-textarea")).toBeNull();
      expect(screen.queryByTestId("calendar-import-btn")).toBeNull();
      expect(screen.queryByTestId("calendar-clear-btn")).toBeNull();
    });

    it("does not render fake data (prices, votes, official rating)", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload());
      expect(screen.queryByText(/€/)).toBeNull();
      expect(screen.queryByText(/votos/i)).toBeNull();
      expect(screen.queryByText(/rating/i)).toBeNull();
    });

    it("shows Seguir serie button on series not followed", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload({ followedSeriesIds: [] }));
      expect(screen.getByTestId("series-follow-btn-lmu-fixed")).toBeTruthy();
    });

    it("clicking Seguir serie emits calendar:series:follow with seriesId", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload({ followedSeriesIds: [] }));
      eventsEmit.mockClear();
      act(() => {
        fireEvent.click(screen.getByTestId("series-follow-btn-lmu-fixed"));
      });
      expect(eventsEmit).toHaveBeenCalledWith("calendar:series:follow", { seriesId: "lmu-fixed" });
    });

    it("shows Siguiendo badge on followed series", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload({ followedSeriesIds: ["lmu-fixed"] }));
      expect(screen.getByTestId("series-following-badge-lmu-fixed")).toBeTruthy();
      expect(screen.getByText("Siguiendo")).toBeTruthy();
    });

    it("shows Dejar de seguir button on followed series", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload({ followedSeriesIds: ["lmu-fixed"] }));
      expect(screen.getByTestId("series-unfollow-btn-lmu-fixed")).toBeTruthy();
      expect(screen.getByText("Dejar de seguir")).toBeTruthy();
    });

    it("clicking Dejar de seguir emits calendar:series:unfollow with seriesId", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", seriesPayload({ followedSeriesIds: ["lmu-fixed"] }));
      eventsEmit.mockClear();
      act(() => {
        fireEvent.click(screen.getByTestId("series-unfollow-btn-lmu-fixed"));
      });
      expect(eventsEmit).toHaveBeenCalledWith("calendar:series:unfollow", { seriesId: "lmu-fixed" });
    });

    it("does not affect legacy event follow — calendar:follow still works for events", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", {
        calendar: {
          version: 1,
          timezone: "UTC",
          reminderMinutes: [30, 15, 10, 5, 2],
          events: [event({ id: "ev-legacy", startTime: "2026-07-02T20:00:00Z" })],
          series: [],
          seriesPreviews: [],
          followedEventIds: [],
          followedSeriesIds: [],
          updated: "",
        },
      });
      eventsEmit.mockClear();
      act(() => {
        fireEvent.click(screen.getByTestId("calendar-follow-btn-ev-legacy"));
      });
      expect(eventsEmit).toHaveBeenCalledWith("calendar:follow", { eventId: "ev-legacy" });
    });

    it("does not affect legacy event unfollow — calendar:unfollow still works for events", () => {
      render(<CalendarPage />);
      dispatch("calendar:loaded", {
        calendar: {
          version: 1,
          timezone: "UTC",
          reminderMinutes: [30, 15, 10, 5, 2],
          events: [event({ id: "ev-legacy", startTime: "2026-07-02T20:00:00Z" })],
          series: [],
          seriesPreviews: [],
          followedEventIds: ["ev-legacy"],
          followedSeriesIds: [],
          updated: "",
        },
      });
      eventsEmit.mockClear();
      act(() => {
        fireEvent.click(screen.getByTestId("calendar-unfollow-btn-ev-legacy"));
      });
      expect(eventsEmit).toHaveBeenCalledWith("calendar:unfollow", { eventId: "ev-legacy" });
    });
  });
});
