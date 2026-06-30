import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastActivityCard } from "./LastActivityCard";

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

const nowMs = new Date("2026-07-01T12:00:00Z").getTime();
const fixedNow = () => new Date(nowMs);

function event(overrides: Record<string, unknown>) {
  return {
    id: "cal-1",
    title: "Race",
    sim: "lmu",
    track: "Le Mans",
    series: "",
    sessionLabel: "",
    startTime: "2026-06-30T20:00:00Z",
    durationMin: 60,
    registrationUrl: "",
    source: "unit-test",
    notes: "",
    ...overrides,
  };
}

describe("LastActivityCard", () => {
  beforeEach(() => {
    clearListeners();
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
  });

  it("shows empty state when no calendar has been loaded", () => {
    render(<LastActivityCard now={fixedNow} />);
    expect(screen.getByTestId("last-activity-empty")).toBeTruthy();
    expect(screen.getByText(/sin carreras registradas/i)).toBeTruthy();
  });

  it("shows the most recent past event when one exists", () => {
    render(<LastActivityCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ id: "a", startTime: "2026-06-29T20:00:00Z", durationMin: 60, title: "Older" }),
          event({ id: "b", startTime: "2026-06-30T20:00:00Z", durationMin: 60, title: "Recent" }),
        ],
        updated: "",
      },
    });
    const card = screen.getByTestId("last-activity-card");
    expect(card).toBeTruthy();
    expect(screen.getByTestId("last-activity-title").textContent).toBe("Recent");
    expect(screen.getByTestId("last-activity-track").textContent).toBe("Le Mans");
    expect(screen.getByTestId("last-activity-disclaimer").textContent).toMatch(
      /resultados oficiales no verificados/i,
    );
  });

  it("ignores events that are still in the future", () => {
    render(<LastActivityCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ startTime: "2026-07-02T20:00:00Z", durationMin: 60 }),
        ],
        updated: "",
      },
    });
    expect(screen.getByTestId("last-activity-empty")).toBeTruthy();
  });

  it("ignores events that are currently active", () => {
    render(<LastActivityCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [
          event({ startTime: "2026-07-01T11:00:00Z", durationMin: 120, title: "Active" }),
        ],
        updated: "",
      },
    });
    // Active events belong to NextRaceCard. The LastActivityCard shows the
    // "empty" placeholder when there are no past events.
    expect(screen.getByTestId("last-activity-empty")).toBeTruthy();
  });

  it("honours an empty events list with the empty branch", () => {
    render(<LastActivityCard now={fixedNow} />);
    dispatch("calendar:loaded", {
      calendar: {
        version: 1,
        timezone: "UTC",
        reminderMinutes: [30, 15, 10, 5, 2],
        events: [],
        updated: "",
      },
    });
    expect(screen.getByTestId("last-activity-empty")).toBeTruthy();
  });
});
