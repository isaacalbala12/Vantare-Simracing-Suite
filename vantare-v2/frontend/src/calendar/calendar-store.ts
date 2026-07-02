// CalendarStore is a tiny reactive helper that mirrors the Wails events
// defined for the calendar service. It deliberately does NOT call any Wails
// emitter on its own; the user is expected to drive imports via the
// ImportCalendarDrawer (CALENDAR-02). For this isolated phase we only need
// the read path so the cards can render.

import { Events } from "@wailsio/runtime";
import {
  EMPTY_CALENDAR,
  type Calendar,
  type CalendarState,
} from "./calendar-types";

export const CALENDAR_LOADED_EVENT = "calendar:loaded";
export const CALENDAR_ERROR_EVENT = "calendar:error";

// subscribeToCalendar wires a callback to be invoked whenever a new calendar
// document is emitted by the backend. It returns the unsubscribe function.
//
// The callback fires with a fully populated CalendarState. If the backend
// emits a Calendar with no events, the state is still "loaded"; the cards
// decide what to render based on the calendar's content.
export function subscribeToCalendar(
  callback: (state: CalendarState) => void,
): () => void {
  const unsubscribe = Events.On(CALENDAR_LOADED_EVENT, (event: unknown) => {
    const data = (event as { data?: { calendar?: Calendar } | Calendar })?.data;
    const calendar = extractCalendar(data);
    callback({ kind: "loaded", calendar });
  });
  return unsubscribe;
}

// requestCalendar asks the backend to push the current calendar. The
// implementation emits the well-known "calendar:get" event; the listener is
// set up by the bridge. If the bridge is not registered (e.g. during unit
// tests) the call is a safe no-op.
export function requestCalendar(): void {
  try {
    Events.Emit("calendar:get", null);
  } catch {
    // Wails runtime not available; ignored on purpose.
  }
}

// subscribeToCalendarErrors wires a callback to error events. Errors do not
// change the state machine: a previous successful load remains the source
// of truth. The error is informational so the UI can show a banner.
export function subscribeToCalendarErrors(
  callback: (message: string) => void,
): () => void {
  return Events.On(CALENDAR_ERROR_EVENT, (event: unknown) => {
    const data = (event as { data?: { message?: string } })?.data;
    callback(data?.message ?? "Error desconocido del calendario");
  });
}

function extractCalendar(input: unknown): Calendar {
  if (!input) {
    return { ...EMPTY_CALENDAR, events: [] };
  }
  // Wails sometimes hands us the payload nested under `data` and sometimes
  // hands us the object directly. Handle both.
  if (typeof input === "object" && input !== null) {
    const maybe = input as { calendar?: Calendar } & Calendar;
    if ("calendar" in maybe && maybe.calendar) {
      return normaliseCalendar(maybe.calendar);
    }
    if ("events" in maybe) {
      return normaliseCalendar(maybe as Calendar);
    }
  }
  return { ...EMPTY_CALENDAR, events: [] };
}

function normaliseCalendar(cal: Calendar): Calendar {
  return {
    version: cal.version ?? 1,
    timezone: cal.timezone ?? EMPTY_CALENDAR.timezone,
    reminderMinutes: Array.isArray(cal.reminderMinutes)
      ? [...cal.reminderMinutes]
      : [...EMPTY_CALENDAR.reminderMinutes],
    events: Array.isArray(cal.events) ? [...cal.events] : [],
    followedEventIds: Array.isArray(cal.followedEventIds)
      ? [...cal.followedEventIds]
      : [],
    updated: cal.updated ?? "",
  };
}
