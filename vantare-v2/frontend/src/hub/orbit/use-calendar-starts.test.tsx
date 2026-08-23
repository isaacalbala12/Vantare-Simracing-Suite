import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendar } from "../../calendar/calendar-types";
import { useCalendarStarts } from "./use-calendar-starts";

const store = vi.hoisted(() => ({
  listeners: new Set<(state: { kind: string; calendar?: unknown }) => void>(),
  requestCalendar: vi.fn(),
}));

vi.mock("../../calendar/calendar-store", () => ({
  subscribeToCalendar: (listener: (state: { kind: string; calendar?: unknown }) => void) => {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },
  requestCalendar: store.requestCalendar,
}));

function calendarWithFollowed(followed: string[]): Calendar {
  return {
    series: [
      {
        id: "s1",
        name: "Serie Uno",
        tier: "weekly",
        recurrence: { intervalMinutes: 15 },
      },
    ],
    followedSeriesIds: followed,
  } as unknown as Calendar;
}

function emit(calendar: Calendar): void {
  for (const listener of store.listeners) listener({ kind: "loaded", calendar });
}

describe("useCalendarStarts", () => {
  beforeEach(() => {
    // 10:07 para que ninguna salida de la cadencia de 15 min caiga en
    // `now`: los ticks cortos no cruzan ninguna frontera de ventana.
    vi.useFakeTimers({ now: new Date("2026-08-22T10:07:00Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
    store.listeners.clear();
    vi.clearAllMocks();
  });

  it("arranca sin calendario y lo pide una vez montado", () => {
    const { result } = renderHook(() => useCalendarStarts());
    expect(result.current.calendar).toBeNull();
    expect(result.current.starts).toHaveLength(0);
    expect(result.current.target).toBeNull();
    expect(store.requestCalendar).toHaveBeenCalled();
  });

  it("publica el estado cuando llega el calendario cargado", () => {
    const { result } = renderHook(() => useCalendarStarts());
    const loaded = calendarWithFollowed(["s1"]);
    act(() => emit(loaded));
    expect(result.current.calendar).toBe(loaded);
    expect(result.current.starts).toHaveLength(1);
    expect(result.current.target?.seriesId).toBe("s1");
  });

  it("en reposo conserva la identidad del estado entre ticks de 15 s", () => {
    const { result } = renderHook(() => useCalendarStarts());
    act(() => emit(calendarWithFollowed(["s1"])));
    const stable = result.current;
    act(() => {
      vi.advanceTimersByTime(15_000);
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current).toBe(stable);
    expect(result.current.starts[0].seriesId).toBe("s1");
  });

  it("publica un estado nuevo cuando una salida pasa y cae de la ventana", () => {
    const { result } = renderHook(() => useCalendarStarts());
    act(() => emit(calendarWithFollowed(["s1"])));
    const before = result.current;
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(result.current).not.toBe(before);
    expect(result.current.starts[0].at.getTime()).toBeGreaterThan(before.starts[0].at.getTime());
  });

  it("publica un estado nuevo cuando cambia el conjunto de series seguidas", () => {
    const { result } = renderHook(() => useCalendarStarts());
    act(() => emit(calendarWithFollowed([])));
    const unfollowed = result.current;
    expect(unfollowed.target?.followed).toBe(false);
    act(() => emit(calendarWithFollowed(["s1"])));
    expect(result.current).not.toBe(unfollowed);
    expect(result.current.target?.followed).toBe(true);
  });
});
