// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCalendarHistory } from "../src/renderer/screens/calendar/CalendarHistory";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => host }));
afterEach(() => {
  cleanup();
  host.client = { request: vi.fn() };
});
const value = { weeks: [], invalidCache: false };
it("reads once per publication and only retries explicitly", async () => {
  host.client.request.mockResolvedValue({
    method: "calendar.historyLoad",
    value,
  });
  const hook = renderHook(
    ({ publication }) => useCalendarHistory(true, publication),
    { initialProps: { publication: "one" } },
  );
  await act(async () => {});
  expect(hook.result.current.view).toEqual(value);
  hook.rerender({ publication: "one" });
  expect(host.client.request).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.reload());
  expect(host.client.request).toHaveBeenCalledTimes(2);
  hook.rerender({ publication: "two" });
  await act(async () => {});
  expect(host.client.request).toHaveBeenCalledTimes(3);
});
it("ignores a late history response when access is revoked", async () => {
  let finish: (reply: unknown) => void = () => {};
  host.client.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(({ allowed }) => useCalendarHistory(allowed, "one"), {
    initialProps: { allowed: true },
  });
  hook.rerender({ allowed: false });
  await act(async () => finish({ method: "calendar.historyLoad", value }));
  expect(hook.result.current.view).toBeUndefined();
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("drops old-client data and exposes a typed failure for retry", async () => {
  let finish: (reply: unknown) => void = () => {};
  host.client.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useCalendarHistory(true, "one"));
  host.client = {
    request: vi.fn().mockRejectedValue(new HostFailure({ kind: "busy" })),
  };
  hook.rerender();
  await act(async () => finish({ method: "calendar.historyLoad", value }));
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.failure).toBe("busy");
  host.client.request.mockResolvedValue({
    method: "calendar.historyLoad",
    value,
  });
  await act(async () => hook.result.current.reload());
  expect(hook.result.current.failure).toBeUndefined();
  expect(hook.result.current.view).toEqual(value);
});
