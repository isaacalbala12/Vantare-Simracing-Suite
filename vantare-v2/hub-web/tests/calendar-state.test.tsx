// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type { CoreStatus } from "../src/contract/generated/contract";
import { calendarReference } from "../src/mock/calendar-reference";
import { coreKey } from "../src/renderer/app/Host";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCalendar } from "../src/renderer/screens/calendar/CalendarState";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => host,
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  host.client = { request: vi.fn() };
});
function mount(allowed = true, connected = false) {
  const core = structuredClone(coreFixture) as CoreStatus;
  if (connected) core.services = "connected";
  core.access = {
    ...core.access,
    verified: allowed,
    blocked: false,
    calendar: allowed,
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  cache.setQueryData(coreKey, core);
  const hook = renderHook(useCalendar, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, cache, core };
}
it("does not request local or remote data without calendar access", async () => {
  const hook = mount(false);
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(host.client.request).not.toHaveBeenCalled();
  expect(hook.result.current.allowed).toBe(false);
});
it("preserves cached data on transport failure and locks simultaneous refreshes", async () => {
  const value = calendarReference();
  host.client.request.mockResolvedValueOnce({ method: "calendar.load", value });
  const hook = mount();
  await act(async () => {});
  expect(hook.result.current.view).toEqual(value);
  let fail: (error: unknown) => void = () => {};
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = hook.result.current.refresh();
    void hook.result.current.refresh();
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  await act(async () => {
    fail(new HostFailure({ kind: "coreUnavailable" }));
    await pending;
  });
  expect(hook.result.current.view).toEqual(value);
  expect(hook.result.current.failure).toBe("coreUnavailable");
  expect(hook.result.current.busy).toBe(false);
});
it("drops late data when calendar access is revoked", async () => {
  const value = calendarReference();
  let finish: (reply: unknown) => void = () => {};
  host.client.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = mount();
  expect(hook.result.current.busy).toBe(true);
  await act(async () => {
    hook.cache.setQueryData(coreKey, {
      ...hook.core,
      access: { ...hook.core.access, calendar: false },
    });
  });
  await act(async () => {
    finish({ method: "calendar.load", value });
  });
  expect(hook.result.current.allowed).toBe(false);
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
});
it("ignores a reply from the previous client after reconnecting", async () => {
  let finish: (reply: unknown) => void = () => {};
  host.client.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = mount(),
    next = { ...calendarReference(), following: [] };
  host.client = {
    request: vi
      .fn()
      .mockResolvedValue({ method: "calendar.load", value: next }),
  };
  await act(async () => {
    hook.rerender();
  });
  expect(hook.result.current.view).toEqual(next);
  await act(async () => {
    finish({ method: "calendar.load", value: calendarReference() });
  });
  expect(hook.result.current.view).toEqual(next);
  expect(hook.result.current.busy).toBe(false);
});

it.each([
  ["2026-11-09T09:00:00Z", true],
  ["2026-11-08T09:00:00Z", false],
] as const)(
  "polls after five minutes only on Monday morning: %s",
  async (date, fast) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(date));
    const value = calendarReference();
    host.client.request.mockImplementation(
      async (request: { method: string }) => ({
        method: request.method,
        value,
      }),
    );
    const hook = mount(true, true);
    await act(async () => {});
    expect(host.client.request).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(host.client.request).toHaveBeenCalledTimes(fast ? 3 : 2);
    expect(hook.result.current.busy).toBe(false);
  },
);
