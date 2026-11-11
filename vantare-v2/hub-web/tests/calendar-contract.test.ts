import { describe, expect, it } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import {
  calendarMinuteLimit,
  calendarTextLimit,
} from "../src/contract/generated/calendar";
import type { CoreStatus } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/calendar.json";
import {
  isCalendarSchedule,
  isCalendarView,
  isReply,
  isRequest,
} from "../src/contract/modules/calendar";
import { create } from "../src/mock/modules/calendar";

describe("calendar closed read-only contract", () => {
  it("accepts every Rust reply and rejects unknown renderer arguments", () => {
    for (const sample of corpus.host) expect(isReply(sample.result)).toBe(true);
    expect(isRequest({ method: "calendar.load", path: "C:/private" })).toBe(
      false,
    );
    expect(isRequest({ method: "calendar.load" })).toBe(true);
  });
  it("rejects unknown view keys and invalid timestamps", () => {
    const value = corpus.host[0].result.value;
    expect(isCalendarView({ ...value, token: "secret" })).toBe(false);
    expect(isCalendarView({ ...value, checked: -1 })).toBe(false);
  });
  it("rejects oversized text, duration, duplicated identity and invalid recurrence", () => {
    const schedule = corpus.host[1].result.value.official;
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
