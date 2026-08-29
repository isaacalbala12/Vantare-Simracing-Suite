import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendar, CalendarState } from "../../calendar/calendar-types";

const calendarBridge = vi.hoisted(() => ({
  requestCalendar: vi.fn(),
  subscribeToCalendar: vi.fn(),
  subscribeToCalendarErrors: vi.fn(),
}));

vi.mock("../../calendar/calendar-store", () => calendarBridge);

import {
  createHttpRaceScheduleStore,
  createWailsRaceScheduleStore,
} from "./race-schedule-store";

const CALENDAR: Calendar = {
  version: 1,
  timezone: "Europe/Madrid",
  reminderMinutes: [15],
  updated: "2026-08-30T00:00:00Z",
  followedEventIds: [],
  followedSeriesIds: [],
  seriesPreviews: [],
  series: [{
    id: "wec-2026",
    name: "WEC 2026",
    tier: "weekly",
    licenseLabel: "Silver",
    track: "Spa",
    vehicleClass: "Hypercar",
    classes: [{ name: "Hypercar" }],
    setup: "Open",
    durationMin: 60,
    splits: 1,
    assists: "Factory",
    tyreWarmers: true,
    tyres: 4,
    recurrence: { kind: "weekly" },
  }],
  events: [{
    id: "spa-practice",
    title: "Spa Practice",
    sim: "LMU",
    track: "Spa",
    series: "wec-2026",
    sessionLabel: "Practice",
    startTime: "2026-08-30T01:00:00+02:00",
    durationMin: 60,
    registrationUrl: "",
    source: "calendar",
    notes: "",
  }],
};

let emitCalendar: ((state: CalendarState) => void) | undefined;
let emitError: (() => void) | undefined;
const unsubscribeCalendar = vi.fn();
const unsubscribeErrors = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  emitCalendar = undefined;
  emitError = undefined;
  calendarBridge.subscribeToCalendar.mockImplementation((listener) => {
    emitCalendar = listener;
    return unsubscribeCalendar;
  });
  calendarBridge.subscribeToCalendarErrors.mockImplementation((listener) => {
    emitError = listener;
    return unsubscribeErrors;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("race schedule productive factories", () => {
  it("loads Calendar through Wails, becomes stale after a later error and disposes both subscriptions", () => {
    const store = createWailsRaceScheduleStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.start();

    expect(calendarBridge.requestCalendar).toHaveBeenCalledOnce();
    emitCalendar?.({ kind: "loaded", calendar: CALENDAR });
    expect(store.getSnapshot()).toMatchObject({
      status: "ready",
      events: [{ id: "spa-practice", track: "Spa", classes: ["Hypercar"] }],
    });

    emitError?.();
    expect(store.getSnapshot()).toMatchObject({ status: "stale" });
    expect(store.getSnapshot().events).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(2);

    store.dispose();
    expect(unsubscribeCalendar).toHaveBeenCalledOnce();
    expect(unsubscribeErrors).toHaveBeenCalledOnce();
  });

  it("reports an initial Wails error without inventing events", () => {
    const store = createWailsRaceScheduleStore();
    store.start();

    emitError?.();

    expect(store.getSnapshot()).toEqual({ events: [], status: "error" });
    store.dispose();
  });

  it("polls Calendar over HTTP, preserves successful events as stale and stops on dispose", async () => {
    vi.useFakeTimers();
    const fetchCalendar = vi.fn()
      .mockResolvedValueOnce(CALENDAR)
      .mockRejectedValueOnce(new Error("calendar unavailable"));
    const store = createHttpRaceScheduleStore(fetchCalendar);

    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(fetchCalendar).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchCalendar).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({ status: "stale" });
    expect(store.getSnapshot().events).toHaveLength(1);

    store.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchCalendar).toHaveBeenCalledTimes(2);
  });

  it("reports an initial HTTP error and ignores a late response after dispose", async () => {
    vi.useFakeTimers();
    const failed = createHttpRaceScheduleStore(() => Promise.reject(new Error("offline")));
    failed.start();
    await vi.waitFor(() => expect(failed.getSnapshot().status).toBe("error"));
    failed.dispose();

    let resolveCalendar: ((calendar: Calendar) => void) | undefined;
    const pending = new Promise<Calendar>((resolve) => { resolveCalendar = resolve; });
    const disposed = createHttpRaceScheduleStore(() => pending);
    disposed.start();
    disposed.dispose();
    resolveCalendar?.(CALENDAR);
    await Promise.resolve();

    expect(disposed.getSnapshot()).toEqual({ events: [], status: "missing" });
  });
});
