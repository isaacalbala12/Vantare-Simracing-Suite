import fixture from "../../../fixtures/calendar-demo.json";
import type { CalendarView } from "../../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import { calendarReference } from "../calendar-reference";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const value: CalendarView = {
    official: null,
    fallback: null,
    previous: null,
    following: [],
    utc: false,
    checked: 0,
    updated: 0,
    invalidCache: false,
  };
  if (
    context.sceneName === "calendar-reference" ||
    context.sceneName === "calendar-live-reference"
  ) {
    context.core.access.verified = true;
    context.core.access.blocked = false;
    context.core.access.calendar = true;
    if (context.sceneName === "calendar-live-reference")
      Object.assign(value, calendarReference());
    else value.official = structuredClone(fixture);
  }
  return (message: UiToHost): HostToUi | undefined => {
    if (
      message.kind !== "request" ||
      !["calendar.load", "calendar.refresh"].includes(message.request.method)
    )
      return undefined;
    const { id, request } = message;
    if (
      request.method !== "calendar.load" &&
      request.method !== "calendar.refresh"
    )
      return undefined;
    const access = context.core.access;
    if (!access.verified || access.blocked || !access.calendar)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (
      request.method === "calendar.refresh" &&
      context.core.services !== "connected"
    )
      return { kind: "failure", id, error: { kind: "coreUnavailable" } };
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(value) },
    };
  };
}
