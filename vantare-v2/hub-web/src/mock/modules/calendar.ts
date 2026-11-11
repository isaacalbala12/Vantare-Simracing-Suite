import type { CalendarView } from "../../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
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
