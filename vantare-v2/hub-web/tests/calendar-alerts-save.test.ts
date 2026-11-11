import { afterEach, beforeEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import {
  isCalendarAlerts,
  isCalendarConfig,
} from "../src/contract/calendar-config-validation";
import {
  type CalendarAlerts,
  calendarBandsLimit,
  calendarDefaultAlerts,
  calendarSlotsLimit,
} from "../src/contract/generated/calendar";
import type { CoreStatus } from "../src/contract/generated/contract";
import { isReply, isRequest } from "../src/contract/modules/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { create } from "../src/mock/modules/calendar";
import { starts } from "../src/renderer/screens/calendar/schedule";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T17:47:13Z"));
});
afterEach(() => vi.useRealTimers());
const defaults = (): CalendarAlerts => ({
  ...calendarDefaultAlerts,
  bands: [],
  slots: [],
  channels: { ...calendarDefaultAlerts.channels },
});
const request = (alerts = defaults()) => ({
  method: "calendar.alertsSave",
  alerts,
  expectedRevision: "a".repeat(64),
});
it("accepts only the closed alert document and a lower-case revision", () => {
  expect(isRequest(request())).toBe(true);
  for (const revision of ["", "a".repeat(63), "A".repeat(64), "g".repeat(64)])
    expect(isRequest({ ...request(), expectedRevision: revision })).toBe(false);
  expect(isRequest({ ...request(), path: "arbitrary" })).toBe(false);
  expect(
    isRequest({ ...request(), alerts: { ...defaults(), future: true } }),
  ).toBe(false);
  expect(
    isRequest({
      ...request(),
      alerts: { ...defaults(), channels: { windows: true } },
    }),
  ).toBe(false);
  expect(
    isRequest({ ...request(), alerts: { ...defaults(), leadMin: 2 } }),
  ).toBe(false);
  expect(isReply({ method: "calendar.alertsSave", value: {} })).toBe(false);
});
it("rejects excess bands and slots and malformed alert identities", () => {
  const band = {
    seriesId: "qa",
    from: 1200,
    to: 1380,
    days: "all",
    mode: "each",
  };
  for (const change of [
    { from: 1380 },
    { to: 1441 },
    { days: "other" },
    { mode: "other" },
    { seriesId: "bad\n" },
  ])
    expect(
      isRequest({
        ...request(),
        alerts: { ...defaults(), bands: [{ ...band, ...change }] },
      }),
    ).toBe(false);
  expect(
    isRequest({
      ...request(),
      alerts: {
        ...defaults(),
        bands: Array(calendarBandsLimit + 1).fill(band),
      },
    }),
  ).toBe(false);
  expect(
    isRequest({
      ...request(),
      alerts: {
        ...defaults(),
        slots: Array(calendarSlotsLimit + 1).fill({ seriesId: "qa", at: 1 }),
      },
    }),
  ).toBe(false);
});
function mock(sceneName = "calendar-test") {
  const core = structuredClone(coreFixture) as CoreStatus;
  core.access = {
    ...core.access,
    verified: true,
    blocked: false,
    calendar: true,
  };
  const host = create({
    core,
    sceneName,
    visual: null,
    notes: [],
    note: () => {},
  });
  const loaded = host({
    kind: "request",
    id: 1,
    request: { method: "calendar.configLoad" },
  });
  if (
    loaded?.kind !== "response" ||
    loaded.result.method !== "calendar.configLoad"
  )
    throw new Error("missing config");
  return { host, core, config: loaded.result.value };
}
it("mock keeps noops and rejects a stale Hub without changing the winner", () => {
  const { host, config } = mock();
  if (!config.alertsRevision) throw new Error("missing revision");
  const save = {
    method: "calendar.alertsSave" as const,
    alerts: config.alerts,
    expectedRevision: config.alertsRevision,
  };
  const noop = host({ kind: "request", id: 2, request: save });
  if (noop?.kind !== "response" || noop.result.method !== save.method)
    throw new Error("missing noop");
  expect(noop.result.value.alertsRevision).toBe(save.expectedRevision);
  const alerts = structuredClone(config.alerts);
  alerts.channels.sound = true;
  const saved = host({ kind: "request", id: 3, request: { ...save, alerts } });
  if (saved?.kind !== "response" || saved.result.method !== save.method)
    throw new Error("missing save");
  expect(saved.result.value.alertsRevision).not.toBe(save.expectedRevision);
  expect(host({ kind: "request", id: 4, request: save })).toMatchObject({
    kind: "failure",
    error: { kind: "calendarConflict", current: { alerts } },
  });
});
it("mock denies missing rights and refuses to enable automatic launch", () => {
  const { host, core, config } = mock();
  if (!config.alertsRevision) throw new Error("missing revision");
  const save = {
    method: "calendar.alertsSave" as const,
    alerts: { ...config.alerts, autoLaunch: true },
    expectedRevision: config.alertsRevision,
  };
  expect(host({ kind: "request", id: 2, request: save })).toMatchObject({
    kind: "failure",
    error: { kind: "rejected" },
  });
  core.access.calendar = false;
  expect(host({ kind: "request", id: 3, request: save })).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
});
it("mock rejects a band without a current publication", () => {
  const { host, config } = mock();
  if (!config.alertsRevision) throw new Error("missing revision");
  const alerts = {
    ...config.alerts,
    bands: [
      {
        seriesId: "qa",
        from: 1200,
        to: 1380,
        days: "all" as const,
        mode: "each" as const,
      },
    ],
  };
  expect(
    host({
      kind: "request",
      id: 2,
      request: {
        method: "calendar.alertsSave",
        alerts,
        expectedRevision: config.alertsRevision,
      },
    }),
  ).toMatchObject({
    kind: "failure",
    error: { kind: "calendarScheduleUnavailable" },
  });
});
it("mock accepts an exact published slot and rejects a fabricated second", () => {
  const { host, config } = mock("calendar-live-reference");
  if (!config.alertsRevision) throw new Error("missing revision");
  const alerts = structuredClone(config.alerts);
  const schedule = calendarReference().official;
  if (!schedule) throw new Error("missing publication");
  const series = schedule.series.find((s) => s.eventKind === "weekly");
  if (!series) throw new Error("missing weekly series");
  const at = starts(
    schedule,
    series,
    Date.now(),
    Date.parse(schedule.validUntil),
    10000,
  )[0];
  if (at === undefined) throw new Error("missing departure");
  alerts.slots.push({ seriesId: series.id, at: at / 1000 });
  const saved = host({
    kind: "request",
    id: 2,
    request: {
      method: "calendar.alertsSave",
      alerts,
      expectedRevision: config.alertsRevision,
    },
  });
  if (
    saved?.kind !== "response" ||
    saved.result.method !== "calendar.alertsSave" ||
    !saved.result.value.alertsRevision
  )
    throw new Error("missing save");
  alerts.slots[alerts.slots.length - 1].at++;
  expect(
    host({
      kind: "request",
      id: 3,
      request: {
        method: "calendar.alertsSave",
        alerts,
        expectedRevision: saved.result.value.alertsRevision,
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
});

it("rejects duplicate bands and slots on writes and in the mock, but reads GPUI legacy identities", () => {
  const { host, config } = mock();
  const band = {
    seriesId: "qa",
    from: 1200,
    to: 1380,
    days: "all" as const,
    mode: "each" as const,
  };
  for (const alerts of [
    { ...defaults(), bands: [band, band] },
    {
      ...defaults(),
      slots: [
        { seriesId: "qa", at: 1 },
        { seriesId: "qa", at: 1 },
      ],
    },
  ]) {
    expect(isCalendarAlerts(alerts)).toBe(false);
    expect(isRequest(request(alerts))).toBe(false);
    expect(
      host({
        kind: "request",
        id: 2,
        request: {
          method: "calendar.alertsSave",
          alerts,
          expectedRevision: config.alertsRevision ?? "",
        },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  }
  const legacy = {
    ...defaults(),
    bands: [band, band, { ...band, seriesId: "\n".repeat(301) }],
    slots: [
      { seriesId: "", at: -1 },
      { seriesId: "", at: -1 },
    ],
  };
  expect(isCalendarAlerts(legacy)).toBe(false);
  expect(isCalendarAlerts(legacy, false)).toBe(true);
  expect(isCalendarConfig({ ...config, alerts: legacy })).toBe(true);
});
it("mock refuses a new explicit slot on a daily series", () => {
  const { host, config } = mock("calendar-live-reference");
  const alerts = {
    ...config.alerts,
    slots: [
      ...config.alerts.slots,
      {
        seriesId: "beginner-lmgt3-fixed",
        at: Date.parse("2026-10-08T18:00:00Z") / 1000,
      },
    ],
  };
  expect(
    host({
      kind: "request",
      id: 2,
      request: {
        method: "calendar.alertsSave",
        alerts,
        expectedRevision: config.alertsRevision ?? "",
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
});
