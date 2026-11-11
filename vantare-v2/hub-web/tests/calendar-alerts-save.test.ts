import { afterEach, beforeEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import {
  type CalendarAlerts,
  calendarBandsLimit,
  calendarDefaultAlerts,
  calendarSlotsLimit,
} from "../src/contract/generated/calendar";
import type { CoreStatus } from "../src/contract/generated/contract";
import { isReply, isRequest } from "../src/contract/modules/calendar";
import { create } from "../src/mock/modules/calendar";

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
  alerts.slots.push({
    seriesId: "beginner-lmgt3-fixed",
    at: Date.parse("2026-10-08T18:00:00Z") / 1000,
  });
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
