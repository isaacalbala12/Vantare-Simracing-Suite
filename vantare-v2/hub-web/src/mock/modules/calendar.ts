import type { CalendarView } from "../../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/calendar.json";
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
  if (context.sceneName === "calendar-data") {
    const sample = (corpus.host as unknown as HostToUi[]).find(
      (m) => m.kind === "response" && m.result.method === "calendar.refresh",
    );
    if (
      sample?.kind === "response" &&
      sample.result.method === "calendar.refresh"
    )
      Object.assign(value, structuredClone(sample.result.value));
    context.core.access.verified = true;
    context.core.access.calendar = true;
    context.core.access.blocked = false;
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
