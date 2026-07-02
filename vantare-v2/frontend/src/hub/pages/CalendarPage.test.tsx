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
    expect(screen.getByRole("heading", { level: 1, name: "Calendario LMU" })).toBeTruthy();
  });

  it("emits calendar:get on mount", () => {
    render(<CalendarPage />);
    expect(eventsEmit).toHaveBeenCalledWith("calendar:get", null);
  });

  it("shows local error and does not emit when import text is empty", () => {
    render(<CalendarPage />);
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-import-btn"));
    });
    expect(eventsEmit).not.toHaveBeenCalledWith("calendar:import", expect.anything());
    expect(screen.getByTestId("calendar-local-error")).toBeTruthy();
  });

  it("emits calendar:import with text/timezone/source when text is present", () => {
    render(<CalendarPage />);
    const textarea = screen.getByTestId("calendar-import-textarea") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: "Martes 2 Julio | 20:00 | Race | Le Mans | 45" } });
    });
    const tzInput = screen.getByTestId("calendar-timezone-input") as HTMLInputElement;
    act(() => {
      fireEvent.change(tzInput, { target: { value: "Europe/Madrid" } });
    });
    const srcInput = screen.getByTestId("calendar-source-input") as HTMLInputElement;
    act(() => {
      fireEvent.change(srcInput, { target: { value: "discord-lmu-week" } });
    });
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-import-btn"));
    });
    expect(eventsEmit).toHaveBeenCalledWith("calendar:import", {
      text: "Martes 2 Julio | 20:00 | Race | Le Mans | 45",
      timezone: "Europe/Madrid",
      source: "discord-lmu-week",
    });
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

  it("emits calendar:clear when clear button is confirmed", () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    render(<CalendarPage />);
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-clear-btn"));
    });
    expect(eventsEmit).toHaveBeenCalledWith("calendar:clear", null);
    window.confirm = originalConfirm;
  });

  it("does not emit calendar:clear when confirm is cancelled", () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);
    render(<CalendarPage />);
    eventsEmit.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("calendar-clear-btn"));
    });
    expect(eventsEmit).not.toHaveBeenCalledWith("calendar:clear", expect.anything());
    window.confirm = originalConfirm;
  });

  it("does not render prohibited fake strings", () => {
    render(<CalendarPage />);
    expect(screen.queryByText(/Sebring/)).toBeNull();
    expect(screen.queryByText(/COTA/)).toBeNull();
    expect(screen.queryByText(/Paul Ricard/)).toBeNull();
  });
});
