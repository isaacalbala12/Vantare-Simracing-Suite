import { describe, expect, it } from "vitest";
import validationCorpus from "../fixtures/calendar-validation.json";
import coreFixture from "../fixtures/core-offline.json";
import {
  calendarMinuteLimit,
  calendarTextLimit,
} from "../src/contract/generated/calendar";
import type { CoreStatus, HostToUi } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/calendar.json";
import {
  isCalendarDate,
  isCalendarSchedule,
  isCalendarView,
  isError,
  isReply,
  isRequest,
} from "../src/contract/modules/calendar";
import { create } from "../src/mock/modules/calendar";

const messages = corpus.host as unknown as HostToUi[];
const load = messages.find(
  (m) => m.kind === "response" && m.result.method === "calendar.load",
);
const refresh = messages.find(
  (m) => m.kind === "response" && m.result.method === "calendar.refresh",
);
if (
  load?.kind !== "response" ||
  load.result.method !== "calendar.load" ||
  refresh?.kind !== "response" ||
  refresh.result.method !== "calendar.refresh"
)
  throw new Error("missing Calendar corpus views");
const empty = load.result.value,
  populated = refresh.result.value;

describe("calendar closed contract", () => {
  it("accepts every Rust reply and rejects unknown renderer arguments", () => {
    for (const sample of messages) {
      if (sample.kind === "response") expect(isReply(sample.result)).toBe(true);
      else if (sample.kind === "failure")
        expect(isError(sample.error)).toBe(true);
    }
    expect(isRequest({ method: "calendar.load", path: "C:/private" })).toBe(
      false,
    );
    expect(isRequest({ method: "calendar.load" })).toBe(true);
  });
  it("rejects unknown view keys and invalid timestamps", () => {
    const value = empty;
    expect(isCalendarView({ ...value, token: "secret" })).toBe(false);
    expect(isCalendarView({ ...value, checked: -1 })).toBe(false);
  });
  it("rejects oversized text, duration, duplicated identity and invalid recurrence", () => {
    const schedule = populated.official;
    expect(schedule).not.toBeNull();
    for (const change of [
      { name: "x".repeat(calendarTextLimit + 1) },
      { raceDurationMin: calendarMinuteLimit + 1 },
      {
        recurrence: {
          kind: "weekly-slots",
          intervalMinutes: 0,
          days: ["Mon"],
          timesUTC: ["25:00"],
        },
      },
      { id: "bad\n" },
    ]) {
      const v = structuredClone(schedule);
      if (!v) throw new Error("missing fixture");
      Object.assign(v.series[0], change);
      expect(isCalendarSchedule(v)).toBe(false);
    }
    const v = structuredClone(schedule);
    if (!v) throw new Error("missing fixture");
    v.series.push(v.series[0]);
    expect(isCalendarSchedule(v)).toBe(false);
  });
});

it("local double checks capability and connection before answering", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  const host = create({
    core,
    sceneName: "calendar-test",
    visual: null,
    notes: [],
    note: () => {},
  });
  const load = {
    kind: "request",
    id: 7,
    request: { method: "calendar.load" },
  } as const;
  const refresh = {
    kind: "request",
    id: 8,
    request: { method: "calendar.refresh" },
  } as const;
  expect(host(load)).toMatchObject({ error: { kind: "denied" } });
  core.access.verified = true;
  core.access.blocked = false;
  core.access.calendar = true;
  expect(host(load)).toMatchObject({ result: { method: "calendar.load" } });
  expect(host(refresh)).toMatchObject({ error: { kind: "coreUnavailable" } });
  core.services = "connected";
  expect(host(refresh)).toMatchObject({
    result: { method: "calendar.refresh" },
  });
  core.access.calendar = false;
  expect(host(refresh)).toMatchObject({ error: { kind: "denied" } });
});

it("matches the shared strict date and Unicode identity corpus", () => {
  for (const row of validationCorpus.dates)
    expect(isCalendarDate(row.value), row.value).toBe(row.valid);
  for (const row of validationCorpus.identities)
    expect(
      isCalendarView({
        ...empty,
        following: [row.value],
      }),
      JSON.stringify(row.value),
    ).toBe(row.valid);
});
it("mock can return a populated schedule while preserving permission checks", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  const host = create({
    core,
    sceneName: "calendar-data",
    visual: null,
    notes: [],
    note: () => {},
  });
  expect(
    host({ kind: "request", id: 1, request: { method: "calendar.load" } }),
  ).toMatchObject({
    result: { value: { official: { series: expect.any(Array) } } },
  });
  core.access.calendar = false;
  expect(
    host({ kind: "request", id: 2, request: { method: "calendar.load" } }),
  ).toMatchObject({ error: { kind: "denied" } });
});

it("rejects revisions, extra keys and wrong config values before dispatch", () => {
  expect(
    isRequest({
      method: "calendar.utcSet",
      utc: true,
      expectedRevision: "a".repeat(64),
    }),
  ).toBe(true);
  for (const expectedRevision of [
    "a".repeat(63),
    "A".repeat(64),
    "g".repeat(64),
  ])
    expect(
      isRequest({ method: "calendar.utcSet", utc: true, expectedRevision }),
    ).toBe(false);
  expect(
    isRequest({
      method: "calendar.followSet",
      seriesId: "bad\n",
      followed: true,
      expectedRevision: "a".repeat(64),
    }),
  ).toBe(false);
  expect(
    isRequest({
      method: "calendar.notifyWeekSet",
      enabled: true,
      expectedRevision: "a".repeat(64),
      path: "C:/private",
    }),
  ).toBe(false);
  expect(isReply({ method: "calendar.unknown", value: {} })).toBe(false);
});

it("mock writes use revisions and refuse the previous revision without changing the winner", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  core.access.verified = true;
  core.access.blocked = false;
  core.access.calendar = true;
  const host = create({
    core,
    sceneName: "calendar-test",
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
  const revision = loaded.result.value.prefsRevision;
  expect(
    host({
      kind: "request",
      id: 2,
      request: {
        method: "calendar.utcSet",
        utc: true,
        expectedRevision: revision,
      },
    }),
  ).toMatchObject({ result: { value: { utc: true } } });
  expect(
    host({
      kind: "request",
      id: 3,
      request: {
        method: "calendar.utcSet",
        utc: false,
        expectedRevision: revision,
      },
    }),
  ).toMatchObject({
    error: { kind: "calendarConflict", current: { utc: true } },
  });
  core.access.calendar = false;
  expect(
    host({
      kind: "request",
      id: 4,
      request: {
        method: "calendar.utcSet",
        utc: false,
        expectedRevision: revision,
      },
    }),
  ).toMatchObject({ error: { kind: "denied" } });
});
it("mock favorites obey the publication and CAS, including an explicit removal", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  const host = create({
    core,
    sceneName: "calendar-data",
    visual: null,
    notes: [],
    note: () => {},
  });
  const loaded = host({
    kind: "request",
    id: 20,
    request: { method: "calendar.configLoad" },
  });
  if (
    loaded?.kind !== "response" ||
    loaded.result.method !== "calendar.configLoad"
  )
    throw new Error("missing config");
  const seriesId = populated.official?.series[0].id;
  if (!seriesId) throw new Error("missing public series");
  const expectedRevision = loaded.result.value.followingRevision;
  const add = host({
    kind: "request",
    id: 21,
    request: {
      method: "calendar.followSet",
      seriesId,
      followed: true,
      expectedRevision,
    },
  });
  if (add?.kind !== "response" || add.result.method !== "calendar.followSet")
    throw new Error("missing saved favorite");
  expect(add.result.value.following).toContain(seriesId);
  expect(
    host({
      kind: "request",
      id: 22,
      request: {
        method: "calendar.followSet",
        seriesId,
        followed: false,
        expectedRevision,
      },
    }),
  ).toMatchObject({
    error: { kind: "calendarConflict", current: { following: [seriesId] } },
  });
  const revision = add.result.value.followingRevision;
  expect(
    host({
      kind: "request",
      id: 23,
      request: {
        method: "calendar.followSet",
        seriesId: "absent",
        followed: true,
        expectedRevision: revision,
      },
    }),
  ).toMatchObject({ error: { kind: "rejected" } });
  expect(
    host({
      kind: "request",
      id: 24,
      request: {
        method: "calendar.followSet",
        seriesId,
        followed: false,
        expectedRevision: revision,
      },
    }),
  ).toMatchObject({ result: { value: { following: [] } } });
});
