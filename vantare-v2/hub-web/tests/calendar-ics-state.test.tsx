// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCalendarIcs } from "../src/renderer/screens/calendar/CalendarIcsState";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => host }));
afterEach(() => {
  cleanup();
  host.client = { request: vi.fn() };
});
const value = {
  calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
  preparedHash: "a".repeat(64),
  entries: [],
  total: 0,
  validUntil: "2026-10-13T00:00:00Z",
};
const reply = { method: "calendar.icsPrepare", value };
it("prepares the native default and drops the visible snapshot before changed options finish", async () => {
  host.client.request.mockResolvedValueOnce(reply);
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.icsPrepare",
    scope: "favs",
    alarm: true,
  });
  expect(hook.result.current.view).toEqual(value);
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  act(() => {
    hook.result.current.setScope("events");
    void hook.result.current.download();
  });
  expect(hook.result.current.view).toBeUndefined();
  expect(host.client.request).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish(reply);
  });
  expect(hook.result.current.view).toEqual(value);
});
it("locks a double export, uses the displayed hash and re-prepares after cancellation", async () => {
  host.client.request.mockResolvedValueOnce(reply);
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = hook.result.current.download();
    void hook.result.current.download();
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.icsExport",
    preparedHash: value.preparedHash,
  });
  host.client.request.mockResolvedValueOnce(reply);
  await act(async () => {
    finish({ method: "calendar.icsExport", status: "cancelled" });
    await pending;
  });
  expect(host.client.request).toHaveBeenCalledTimes(3);
  expect(hook.result.current.status).toBe("cancelled");
  expect(hook.result.current.view).toEqual(value);
});
it("ignores late preparation after access loss and clears busy", async () => {
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const hook = renderHook(({ allowed }) => useCalendarIcs(true, allowed), {
    initialProps: { allowed: true },
  });
  hook.rerender({ allowed: false });
  await act(async () => {
    finish(reply);
  });
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
  await act(async () => {
    await hook.result.current.download();
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("clears a failed prepare and retries only on explicit request", async () => {
  host.client.request.mockRejectedValueOnce(new Error("local failure"));
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.failure).toBe("coreUnavailable");
  host.client.request.mockResolvedValueOnce(reply);
  act(() => hook.result.current.retry());
  await act(async () => {});
  expect(hook.result.current.view).toEqual(value);
  expect(hook.result.current.failure).toBeUndefined();
});
