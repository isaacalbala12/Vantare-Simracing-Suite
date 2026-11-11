// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCalendarPreferences } from "../src/renderer/screens/calendar/CalendarPreferences";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => host }));
afterEach(() => {
  cleanup();
  host.client = { request: vi.fn() };
});
const config: import("../src/contract/generated/calendar").CalendarConfigView =
  {
    documents: { prefs: "ready", following: "ready", alerts: "ready" },
    utc: false,
    prefsRevision: "a".repeat(64),
    following: [],
    followingRevision: "b".repeat(64),
    alerts: {
      leadMin: 10,
      bands: [],
      slots: [],
      channels: { windows: true, inTrack: true, sound: false },
      autoLaunch: false,
      notifyWeek: true,
    },
    alertsRevision: "c".repeat(64),
  };
it("uses the observed revision and retries a conflict only after an explicit action", async () => {
  host.client.request.mockResolvedValueOnce({
    method: "calendar.configLoad",
    value: config,
  });
  const hook = renderHook(() => useCalendarPreferences(true));
  await act(async () => {});
  const winner = { ...config, prefsRevision: "d".repeat(64) };
  host.client.request.mockRejectedValueOnce(
    new HostFailure({ kind: "calendarConflict", current: winner }),
  );
  await act(async () => {
    await hook.result.current.utc(true);
  });
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.utcSet",
    utc: true,
    expectedRevision: config.prefsRevision,
  });
  expect(hook.result.current.config).toEqual(winner);
  expect(hook.result.current.failure).toBe("calendarConflict");
  expect(host.client.request).toHaveBeenCalledTimes(2);
  host.client.request.mockResolvedValueOnce({
    method: "calendar.utcSet",
    value: { ...winner, utc: true },
  });
  await act(async () => {
    await hook.result.current.retry();
  });
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.utcSet",
    utc: true,
    expectedRevision: winner.prefsRevision,
  });
  expect(hook.result.current.config?.utc).toBe(true);
  expect(hook.result.current.failure).toBeUndefined();
});
it("drops late preferences and clears the busy state when access is revoked", async () => {
  let finish: (value: unknown) => void = () => {};
  host.client.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(({ allowed }) => useCalendarPreferences(allowed), {
    initialProps: { allowed: true },
  });
  expect(hook.result.current.busy).toBe(true);
  hook.rerender({ allowed: false });
  await act(async () => {
    finish({ method: "calendar.configLoad", value: config });
  });
  expect(hook.result.current.config).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
  await act(async () => {
    await hook.result.current.utc(true);
  });
  expect(host.client.request).toHaveBeenCalledOnce();
});
it("locks duplicate writes while an acknowledged favorite change is pending", async () => {
  host.client.request.mockResolvedValueOnce({
    method: "calendar.configLoad",
    value: config,
  });
  const hook = renderHook(() => useCalendarPreferences(true));
  await act(async () => {});
  let finish: (value: unknown) => void = () => {};
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending = Promise.resolve();
  act(() => {
    pending = hook.result.current.follow("series", true);
    void hook.result.current.follow("series", true);
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish({
      method: "calendar.followSet",
      value: { ...config, following: ["series"] },
    });
    await pending;
  });
  expect(hook.result.current.config?.following).toEqual(["series"]);
});

it("protects a damaged document without blocking another document, then reloads recovery", async () => {
  const damaged = {
    ...config,
    prefsRevision: null,
    documents: { ...config.documents, prefs: "protected" as const },
  };
  host.client.request.mockResolvedValueOnce({
    method: "calendar.configLoad",
    value: damaged,
  });
  const hook = renderHook(() => useCalendarPreferences(true));
  await act(async () => {});
  expect(hook.result.current.canUtc).toBe(false);
  expect(hook.result.current.canNotifyWeek).toBe(true);
  await act(async () => {
    await hook.result.current.utc(true);
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
  expect(hook.result.current.failure).toBe("rejected");
  host.client.request.mockResolvedValueOnce({
    method: "calendar.notifyWeekSet",
    value: { ...damaged, alerts: { ...damaged.alerts, notifyWeek: false } },
  });
  await act(async () => {
    await hook.result.current.notifyWeek(false);
  });
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.notifyWeekSet",
    enabled: false,
    expectedRevision: config.alertsRevision,
  });
  host.client.request.mockResolvedValueOnce({
    method: "calendar.configLoad",
    value: config,
  });
  await act(async () => {
    await hook.result.current.reload();
  });
  expect(hook.result.current.canUtc).toBe(true);
  expect(hook.result.current.failure).toBeUndefined();
});

it("retries a band conflict over the winner without replacing its other preferences", async () => {
  const initial = structuredClone(config);
  initial.alerts.bands = [
    { seriesId: "qa", from: 1200, to: 1380, days: "all", mode: "each" },
  ];
  host.client.request.mockResolvedValueOnce({
    method: "calendar.configLoad",
    value: initial,
  });
  const hook = renderHook(() => useCalendarPreferences(true));
  await act(async () => {});
  const winner = structuredClone(initial);
  winner.alertsRevision = "d".repeat(64);
  winner.alerts.bands[0].to = 1410;
  winner.alerts.channels.sound = true;
  host.client.request.mockRejectedValueOnce(
    new HostFailure({ kind: "calendarConflict", current: winner }),
  );
  await act(async () => {
    await hook.result.current.band("qa", {
      ...initial.alerts.bands[0],
      from: 1230,
    });
  });
  expect(hook.result.current.failure).toBe("calendarConflict");
  expect(host.client.request).toHaveBeenCalledTimes(2);
  const saved = structuredClone(winner);
  saved.alerts.bands[0].from = 1230;
  host.client.request.mockResolvedValueOnce({
    method: "calendar.alertsSave",
    value: saved,
  });
  await act(async () => {
    await hook.result.current.retry();
  });
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.alertsSave",
    alerts: saved.alerts,
    expectedRevision: winner.alertsRevision,
  });
  expect(hook.result.current.config?.alerts.channels.sound).toBe(true);
  expect(hook.result.current.failure).toBeUndefined();
});
