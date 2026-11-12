import { afterEach, describe, expect, it, vi } from "vitest";
import { isCalendarNotice } from "../src/contract/calendar-notice-validation";
import type { CalendarNotice } from "../src/contract/generated/calendar";
import { calendarNoticeSession } from "../src/main/calendar-notices";

import { presentSystemNotice } from "../src/main/system-notifications";

const electron = vi.hoisted(() => ({
  supported: true,
  show: vi.fn(),
  on: vi.fn(),
  options: vi.fn(),
}));

vi.mock("electron", () => ({
  Notification: class {
    static isSupported() {
      return electron.supported;
    }
    constructor(options: unknown) {
      electron.options(options);
    }
    show() {
      electron.show();
    }
    on(...args: unknown[]) {
      electron.on(...args);
    }
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  electron.supported = true;
});

const testNotice = (
  overrides: Partial<Extract<CalendarNotice, { kind: "test" }>> = {},
): CalendarNotice => ({
  kind: "test",
  id: "a".repeat(64),
  requestId: 7,
  issuedAt: 1000,
  expiresAt: 61000,
  silent: true,
  ...overrides,
});

describe("main Calendar presenter", () => {
  it("presents once, privately consumes the event and reports the actual presenter result", () => {
    const present = vi.fn(
        (_value: { title: string; body: string; silent: boolean }) => false,
      ),
      session = calendarNoticeSession(present, () => 1000),
      value = testNotice();

    session.receive(value);
    session.receive(value);

    expect(present).toHaveBeenCalledTimes(1);

    expect(present.mock.calls[0]?.[0]).toEqual({
      title: "Aviso de prueba del calendario",
      body: expect.any(String),
      silent: true,
    });

    expect(
      session.observe({
        kind: "event",
        event: { topic: "calendarNotice", value },
      }),
    ).toBeUndefined();

    expect(
      session.observe({
        kind: "response",
        id: 7,
        result: { method: "calendar.noticeTest", accepted: true },
      }),
    ).toEqual({
      kind: "response",
      id: 7,
      result: { method: "calendar.noticeTest", accepted: false },
    });
  });

  it("rejects expired/future notices and never claims a missing presentation succeeded", () => {
    const present = vi.fn(
        (_value: { title: string; body: string; silent: boolean }) => true,
      ),
      session = calendarNoticeSession(present, () => 1000);

    session.receive(testNotice({ issuedAt: 1001 }));
    session.receive(testNotice({ issuedAt: 0, expiresAt: 999 }));

    expect(present).not.toHaveBeenCalled();

    expect(
      session.observe({
        kind: "response",
        id: 7,
        result: { method: "calendar.noticeTest", accepted: true },
      }),
    ).toMatchObject({ result: { accepted: false } });
  });

  it("preserves sound policy and escapes no strings as markup or navigation", () => {
    const present = vi.fn(
        (_value: { title: string; body: string; silent: boolean }) => true,
      ),
      session = calendarNoticeSession(present, () => 1000);

    session.receive({
      kind: "start",
      id: "b".repeat(64),
      issuedAt: 1000,
      expiresAt: 61000,
      at: 601000,
      series: "<b>LMGT3</b>",
      track: "Spa",
      raceMinutes: 30,
      silent: false,
    });

    expect(present).toHaveBeenCalledWith({
      title: expect.stringContaining("<b>LMGT3</b> sale a las"),
      body: "Spa · carrera 30 min · en 10 min",
      silent: false,
    });

    session.close();
    session.receive(testNotice());
    expect(present).toHaveBeenCalledTimes(1);

    expect(
      session.observe({
        kind: "response",
        id: 7,
        result: { method: "calendar.noticeTest", accepted: true },
      }),
    ).toMatchObject({ result: { accepted: false } });
  });

  it("uses only a Notification double and handles unsupported/throwing implementations", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const value = { title: "Prueba", body: "Ejemplo", silent: true };

    expect(presentSystemNotice(value)).toBe(true);
    expect(electron.show).toHaveBeenCalledTimes(1);

    expect(electron.options).toHaveBeenCalledWith(value);

    electron.supported = false;
    expect(presentSystemNotice(value)).toBe(false);

    electron.supported = true;
    electron.show.mockImplementationOnce(() => {
      throw Error("QA");
    });
    expect(presentSystemNotice(value)).toBe(false);
  });
});

describe("closed Calendar event validation", () => {
  it("accepts all three variants and rejects injected fields and invalid bounds", () => {
    const base = testNotice();
    expect(isCalendarNotice(base)).toBe(true);

    for (const value of [
      { ...base, title: "injected" },
      { ...base, id: "z".repeat(64) },
      { ...base, requestId: -1 },
      { ...base, issuedAt: -1 },
      { ...base, expiresAt: 61001 },
      { ...base, expiresAt: 999 },
      { ...base, silent: 1 },
      { ...base, kind: "other" },
    ])
      expect(isCalendarNotice(value)).toBe(false);

    const start = {
      kind: "start",
      id: "b".repeat(64),
      issuedAt: 1000,
      expiresAt: 61000,
      at: 601000,
      series: "LMGT3",
      track: "Spa",
      raceMinutes: 30,
      silent: false,
    };

    expect(isCalendarNotice(start)).toBe(true);

    for (const value of [
      { ...start, series: "x".repeat(301) },
      { ...start, track: "a\n" },
      { ...start, raceMinutes: 10081 },
      { ...start, at: 0 },
    ])
      expect(isCalendarNotice(value)).toBe(false);

    const week = {
      kind: "week",
      id: "c".repeat(64),
      issuedAt: 1000,
      expiresAt: 61000,
      from: 1000,
      until: 2000,
      silent: true,
    };

    expect(isCalendarNotice(week)).toBe(true);
    expect(isCalendarNotice({ ...week, until: 1000 })).toBe(false);
  });
});

import coreFixture from "../fixtures/core-offline.json";
import type { CoreStatus, HostToUi } from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { create } from "../src/mock/modules/calendar";

it("mock emits only a fixed typed sample after rights and rate guards", () => {
  const core = structuredClone(coreFixture) as CoreStatus,
    emit = vi.fn();
  const host = create({
    core,
    emit,
    sceneName: "calendar-data",
    visual: null,
    notes: [],
    note: () => {},
  });
  const request = {
    kind: "request",
    id: 80,
    request: { method: "calendar.noticeTest" },
  } as const;
  expect(host(request)).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
  core.rights = "connected";
  expect(host(request)).toMatchObject({
    kind: "response",
    result: { accepted: true },
  });
  expect(emit).toHaveBeenCalledTimes(1);
  const event = emit.mock.calls[0]?.[0] as HostToUi;
  expect(isHostMessage(event)).toBe(true);
  expect(event).toMatchObject({
    kind: "event",
    event: {
      topic: "calendarNotice",
      value: { kind: "test", requestId: 80, silent: true },
    },
  });
  expect(host({ ...request, id: 81 })).toMatchObject({
    kind: "failure",
    error: { kind: "busy" },
  });
  core.access.blocked = true;
  expect(host({ ...request, id: 82 })).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
  expect(emit).toHaveBeenCalledTimes(1);
});

import { calendarNoticeText } from "../src/renderer/i18n/calendar-notices";

it("formats the frozen GPUI week and duration labels without OS actions", () => {
  const base = {
    id: "c".repeat(64),
    issuedAt: 1000,
    expiresAt: 61000,
    silent: true,
  };
  expect(
    calendarNoticeText(
      {
        ...base,
        kind: "week",
        from: Date.parse("2026-09-29T00:00:00Z"),
        until: Date.parse("2026-10-06T00:00:00Z"),
      },
      1000,
    ),
  ).toEqual({
    title: "Ya está el horario de la semana 29 sep–5 oct",
    body: "Tus favoritas y tus avisos pasan solos a la semana nueva.",
  });
  expect(
    calendarNoticeText(
      {
        ...base,
        kind: "start",
        series: "QA",
        track: "Spa (Full)",
        at: 601000,
        raceMinutes: 100,
      },
      1000,
    ).body,
  ).toBe("Spa · carrera 1 h 40 min · en 10 min");
});
it("keeps the main-process test clock independent of the visual bank date", () => {
  const core = structuredClone(coreFixture) as CoreStatus;
  core.rights = "connected";
  const emit = vi.fn();
  const host = create({
    core,
    emit,
    sceneName: "calendar-live-reference",
    visual: /visual/.exec("visual"),
    notes: [],
    note: () => {},
  });
  const before = Date.now();
  host({ kind: "request", id: 91, request: { method: "calendar.noticeTest" } });
  const event = emit.mock.calls[0]?.[0] as HostToUi;
  expect(event).toMatchObject({
    kind: "event",
    event: {
      topic: "calendarNotice",
      value: { kind: "test", issuedAt: expect.any(Number) },
    },
  });
  if (event.kind !== "event" || event.event.topic !== "calendarNotice")
    throw Error("missing fixed sample");
  expect(event.event.value.issuedAt).toBeGreaterThanOrEqual(before);
  expect(event.event.value.expiresAt).toBeGreaterThan(Date.now());
});
