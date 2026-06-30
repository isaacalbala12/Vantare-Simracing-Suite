import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRaceCard } from "./NextRaceCard";

type Handler = (event: { data: unknown }) => void;
const listeners = new Map<string, Handler[]>();

afterEach(() => {
  cleanup();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: Handler) => {
      const list = listeners.get(name) ?? [];
      list.push(cb);
      listeners.set(name, list);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

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

const now = new Date("2026-07-01T12:00:00Z").getTime();
const fixedNow = () => new Date(now);

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

describe("NextRaceCard", () => {
  beforeEach(() => {
    clearListeners();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it("shows empty state when no calendar has been loaded", () => {
    render(<NextRaceCard now={fixedNow} />);
    expect(screen.getByTestId("next-race-empty")).toBeTruthy();
    expect(screen.getByText(/calendario lmu no cargado/i)).toBeTruthy();
  });

  it("shows countdown for the next future event when a calendar arrives", () => {
    render(<NextRaceCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [event({})],
        updated: "",
      },
    });
    expect(screen.getByTestId("next-race-card")).toBeTruthy();
    expect(screen.getByTestId("next-race-title").textContent).toBe("Race");
    expect(screen.getByTestId("next-race-track").textContent).toBe("Le Mans");
    // 1d 8h from 2026-07-01 12:00 to 2026-07-02 20:00.
    expect(screen.getByTestId("next-race-countdown").textContent).toBe("En 1d 8h");
  });

  it("marks the event as 'Ahora' while it is active", () => {
    render(<NextRaceCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({
            startTime: "2026-07-01T11:00:00Z",
            durationMin: 120,
          }),
        ],
        updated: "",
      },
    });
    expect(screen.getByTestId("next-race-countdown").textContent).toBe("Ahora");
  });

  it("shows no-upcoming when the calendar has only past events", () => {
    render(<NextRaceCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({
            startTime: "2026-06-30T08:00:00Z",
            durationMin: 60,
          }),
        ],
        updated: "",
      },
    });
    expect(screen.getByTestId("next-race-no-upcoming")).toBeTruthy();
    expect(screen.getByText(/sin carreras pr\u00f3ximas/i)).toBeTruthy();
  });

  it("honours empty events list with the no-upcoming branch", () => {
    render(<NextRaceCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [],
        updated: "",
      },
    });
    expect(screen.getByTestId("next-race-no-upcoming")).toBeTruthy();
  });

  it("prefers the active event over a later future event", () => {
    render(<NextRaceCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ id: "a", startTime: "2026-07-01T11:00:00Z", durationMin: 120, title: "Active" }),
          event({ id: "b", startTime: "2026-07-02T20:00:00Z", durationMin: 60, title: "Future" }),
        ],
        updated: "",
      },
    });
    expect(screen.getByTestId("next-race-title").textContent).toBe("Active");
  });
});
