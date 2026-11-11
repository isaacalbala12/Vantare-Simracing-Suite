import alertsReference from "../../../fixtures/calendar-alerts-reference.json";
import fixture from "../../../fixtures/calendar-demo.json";
import {
  type CalendarAlerts,
  type CalendarConfigView,
  type CalendarHistoryView,
  type CalendarSchedule,
  type CalendarView,
  calendarDefaultAlerts,
  calendarEmptyRevision,
  calendarRevisionLength,
  calendarSeriesLimit,
  calendarStartsLimit,
} from "../../contract/generated/calendar";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import corpus from "../../contract/generated/corpus/calendar.json";
import { starts } from "../../renderer/screens/calendar/schedule";
import {calendarHistoryReference,calendarReference} from "../calendar-reference";
import type { MockContext, MockHandler } from "../context";

function alertValue(alerts: CalendarAlerts) {
  return JSON.stringify([
    alerts.leadMin,
    alerts.autoLaunch,
    alerts.notifyWeek,
    alerts.channels.windows,
    alerts.channels.inTrack,
    alerts.channels.sound,
    alerts.bands.map((band) => [
      band.seriesId,
      band.from,
      band.to,
      band.days,
      band.mode,
    ]),
    alerts.slots.map((slot) => [slot.seriesId, slot.at]),
  ]);
}
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
  const history: CalendarHistoryView = { weeks: [], invalidCache: false };
  if (context.sceneName === "calendar-data") {
    const historySample = (corpus.host as unknown as HostToUi[]).find(
      (m) =>
        m.kind === "response" && m.result.method === "calendar.historyLoad",
    );
    if (
      historySample?.kind === "response" &&
      historySample.result.method === "calendar.historyLoad"
    )
      Object.assign(history, structuredClone(historySample.result.value));
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
  if (
    context.sceneName === "calendar-reference" ||
    context.sceneName === "calendar-live-reference"
  ) {
    context.core.access.verified = true;
    context.core.access.blocked = false;
    context.core.access.calendar = true;
    if (context.sceneName === "calendar-live-reference") {
      Object.assign(value, calendarReference());
      Object.assign(history, calendarHistoryReference());
    } else value.official = structuredClone(fixture);
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
    documents: { prefs: "ready", following: "ready", alerts: "ready" },
  };
  if (context.sceneName === "calendar-live-reference")
    config.alerts = structuredClone(alertsReference) as CalendarAlerts;
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
      case "calendar.historyLoad":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(history) },
        };
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
      case "calendar.alertsSave": {
        if (request.expectedRevision !== config.alertsRevision)
          return conflict();
        const proposed = request.alerts,
          old = config.alerts;
        if (alertValue(proposed) === alertValue(old)) break;
        if (proposed.autoLaunch && !old.autoLaunch)
          return { kind: "failure", id, error: { kind: "rejected" } };
        const now = Date.now();
        const active = [value.official, value.fallback].filter(
          (schedule): schedule is CalendarSchedule =>
            !!schedule &&
            Date.parse(schedule.validFrom) <= now &&
            now < Date.parse(schedule.validUntil),
        );
        const bands = proposed.bands.filter(
          (band) =>
            !old.bands.some(
              (previous) =>
                previous.seriesId === band.seriesId &&
                previous.from === band.from &&
                previous.to === band.to &&
                previous.days === band.days &&
                previous.mode === band.mode,
            ),
        );
        const slots = proposed.slots.filter(
          (slot) =>
            !old.slots.some(
              (previous) =>
                previous.seriesId === slot.seriesId && previous.at === slot.at,
            ),
        );
        if (slots.some((slot) => slot.at * 1000 < now))
          return { kind: "failure", id, error: { kind: "rejected" } };
        if ((bands.length || slots.length) && !active.length)
          return {
            kind: "failure",
            id,
            error: { kind: "calendarScheduleUnavailable" },
          };
        if (
          bands.some(
            (band) =>
              !active.some((schedule) =>
                schedule.series.some(
                  (series) =>
                    series.id === band.seriesId &&
                    series.recurrence.kind === "interval" &&
                    !["weekly", "special"].includes(series.eventKind),
                ),
              ),
          ) ||
          slots.some(
            (slot) =>
              !active.some((schedule) =>
                schedule.series.some(
                  (series) =>
                    series.id === slot.seriesId &&
                    starts(
                      schedule,
                      series,
                      slot.at * 1000,
                      slot.at * 1000 + 1,
                      calendarStartsLimit,
                    ).length === 1,
                ),
              ),
          )
        )
          return { kind: "failure", id, error: { kind: "rejected" } };
        config.alerts = structuredClone(proposed);
        config.alertsRevision = next();
        break;
      }
      case "calendar.utcSet":
        if (request.expectedRevision !== config.prefsRevision)
          return conflict();
        if (config.utc === request.utc) break;
        config.utc = request.utc;
        value.utc = request.utc;
        config.prefsRevision = next();
        break;
      case "calendar.notifyWeekSet":
        if (request.expectedRevision !== config.alertsRevision)
          return conflict();
        if (config.alerts.notifyWeek === request.enabled) break;
        config.alerts.notifyWeek = request.enabled;
        config.alertsRevision = next();
        break;
      case "calendar.followSet": {
        if (request.expectedRevision !== config.followingRevision)
          return conflict();
        if (config.following.includes(request.seriesId) === request.followed)
          break;
        if (request.followed) {
          const now = Date.now(),
            active = [value.official, value.fallback].filter(
              (s) =>
                s &&
                Date.parse(s.validFrom) <= now &&
                now < Date.parse(s.validUntil),
            );
          if (!active.length)
            return {
              kind: "failure",
              id,
              error: { kind: "calendarScheduleUnavailable" },
            };
          if (
            !active.some((s) =>
              s?.series.some((s) => s.id === request.seriesId),
            )
          )
            return { kind: "failure", id, error: { kind: "rejected" } };
        }
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
