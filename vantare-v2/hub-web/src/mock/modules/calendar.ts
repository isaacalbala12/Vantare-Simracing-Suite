import fixture from "../../../fixtures/calendar-demo.json";
import {
  type CalendarConfigView,
  type CalendarView,
  calendarDefaultAlerts,
  calendarEmptyRevision,
  calendarRevisionLength,
  calendarSeriesLimit,
} from "../../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/calendar.json";
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
  if (context.sceneName === "calendar-reference" || context.sceneName === "calendar-live-reference") {
    context.core.access.verified = true;
    context.core.access.blocked = false;
    context.core.access.calendar = true;
    if (context.sceneName === "calendar-live-reference")
      Object.assign(value, calendarReference());
    else value.official = structuredClone(fixture);
  }
  const config: CalendarConfigView = {
    utc: false,
    prefsRevision: calendarEmptyRevision,
    following: [],
    followingRevision: calendarEmptyRevision,
    alerts: {
      ...calendarDefaultAlerts,
      bands: [...calendarDefaultAlerts.bands],
      slots: [...calendarDefaultAlerts.slots],
      channels: { ...calendarDefaultAlerts.channels },
    },
    alertsRevision: calendarEmptyRevision,
  };
  config.utc = value.utc;
  config.following = [...value.following];
  let counter = 1;
  const next = () =>
    String((counter++).toString(16)).padStart(calendarRevisionLength, "0");
  return (message: UiToHost): HostToUi | undefined => {
    if (
      message.kind !== "request" ||
      !message.request.method.startsWith("calendar.")
    )
      return undefined;
    const { id, request } = message,
      access = context.core.access;
    if (!access.verified || access.blocked || !access.calendar)
      return { kind: "failure", id, error: { kind: "denied" } };
    const conflict = (): HostToUi => ({
      kind: "failure",
      id,
      error: { kind: "calendarConflict", current: structuredClone(config) },
    });
    switch (request.method) {
      case "calendar.load":
      case "calendar.refresh":
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
      case "calendar.configLoad":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(config) },
        };
      case "calendar.utcSet":
        if (request.expectedRevision !== config.prefsRevision)
          return conflict();
        config.utc = request.utc;
        value.utc = request.utc;
        config.prefsRevision = next();
        break;
      case "calendar.notifyWeekSet":
        if (request.expectedRevision !== config.alertsRevision)
          return conflict();
        config.alerts.notifyWeek = request.enabled;
        config.alertsRevision = next();
        break;
      case "calendar.followSet": {
        if (request.expectedRevision !== config.followingRevision)
          return conflict();
        const found = [value.official, value.fallback, value.previous].some(
          (s) => s?.series.some((s) => s.id === request.seriesId),
        );
        if (request.followed && !found)
          return { kind: "failure", id, error: { kind: "rejected" } };
        const ids = config.following.filter((s) => s !== request.seriesId);
        if (request.followed) ids.push(request.seriesId);
        if (ids.length > calendarSeriesLimit)
          return { kind: "failure", id, error: { kind: "rejected" } };
        config.following = ids;
        value.following = [...ids];
        config.followingRevision = next();
        break;
      }
      default:
        return undefined;
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(config) },
    };
  };
}
