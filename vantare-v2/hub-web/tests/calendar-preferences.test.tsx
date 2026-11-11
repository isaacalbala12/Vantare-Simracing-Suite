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
const config = {
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
