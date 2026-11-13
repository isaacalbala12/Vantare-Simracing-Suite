// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type { CalendarLaunchView } from "../src/contract/generated/calendar";
import type { CoreStatus, HostToUi } from "../src/contract/generated/contract";
import { coreKey } from "../src/renderer/app/Host";
import { useCalendarLaunch } from "../src/renderer/screens/calendar/CalendarLaunch";

const api = vi.hoisted(() => ({
  request: vi.fn(),
  listen: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => ({ client: api }),
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
  vi.clearAllMocks();
});
const empty: CalendarLaunchView = {
  armed: null,
  automatic: null,
  latest: null,
  change: null,
};
function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  const core = {
    ...structuredClone(coreFixture),
    accountGeneration: "a".repeat(64),
    rights: "connected",
  } as CoreStatus;
  cache.setQueryData(coreKey, core);
  let event: (m: HostToUi) => void = () => {};
  const off = vi.fn();
  api.listen.mockImplementation((fn) => {
    event = fn;
    return off;
  });
  const capture = () => ({
    profile: "lmu",
    baseRevision: "b".repeat(64),
    armedGeneration: core.accountGeneration!,
  });
  const reload = vi.fn();
  const hook = renderHook(
    ({ allowed }) => useCalendarLaunch(allowed, capture, reload),
    {
      initialProps: { allowed: true },
      wrapper: ({ children }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  return {
    ...hook,
    cache,
    core,
    reload,
    event: (value: CalendarLaunchView) =>
      act(() =>
        event({ kind: "event", event: { topic: "calendarLaunch", value } }),
      ),
  };
}
it("captures revision/generation once, blocks duplicate clicks and accepts host snapshot without optimism", async () => {
  const h = setup();
  let done: (r: unknown) => void = () => {};
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  act(() => {
    void h.result.current.arm({
      kind: "once",
      seriesId: "s",
      startAt: 1800000180000,
    });
    void h.result.current.arm({
      kind: "once",
      seriesId: "s",
      startAt: 1800000180000,
    });
  });
  expect(api.request).toHaveBeenCalledOnce();
  expect(api.request).toHaveBeenCalledWith({
    method: "calendar.launchArm",
    profile: "lmu",
    baseRevision: "b".repeat(64),
    armedGeneration: "a".repeat(64),
    mode: { kind: "once", seriesId: "s", startAt: 1800000180000 },
  });
  expect(h.result.current.view).toBeUndefined();
  await act(async () =>
    done({ method: "calendar.launchArm", value: empty, config: null }),
  );
  expect(h.result.current.view).toEqual(empty);
  expect(h.result.current.busy).toBe(false);
});
it("a later topic wins over an older arm response", async () => {
  const h = setup();
  let done: (r: unknown) => void = () => {};
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  act(
    () =>
      void h.result.current.arm({
        kind: "alerts",
        expectedRevision: "c".repeat(64),
      }),
  );
  const current = {
    ...empty,
    latest: {
      armId: "d".repeat(64),
      profileName: "LMU",
      seriesId: "s",
      startAt: 1800000180000,
      progress: { kind: "unknown", request: null, reason: "noReceipt" },
    },
  } satisfies CalendarLaunchView;
  h.event(current);
  await act(async () =>
    done({ method: "calendar.launchArm", value: empty, config: null }),
  );
  expect(h.result.current.view).toEqual(current);
});
it("ignores a late reply after account invalidation and does not cancel host plans on navigation", async () => {
  const h = setup();
  let done: (r: unknown) => void = () => {};
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  act(
    () =>
      void h.result.current.arm({
        kind: "alerts",
        expectedRevision: "c".repeat(64),
      }),
  );
  await act(async () =>
    h.cache.setQueryData(coreKey, {
      ...h.core,
      accountGeneration: "e".repeat(64),
    }),
  );
  await act(async () =>
    done({ method: "calendar.launchArm", value: empty, config: null }),
  );
  expect(h.result.current.view).toBeUndefined();
  h.unmount();
  expect(api.request).toHaveBeenCalledOnce();
});
it("cancels only the opaque identifier and refreshes config after an automatic arm", async () => {
  const h = setup();
  api.request.mockImplementation(async (request) => ({
    method: request.method,
    value: empty,
    config: {},
  }));
  await act(async () =>
    h.result.current.arm({ kind: "alerts", expectedRevision: "c".repeat(64) }),
  );
  expect(h.reload).toHaveBeenCalledOnce();
  await act(async () => h.result.current.cancel("f".repeat(64)));
  expect(api.request).toHaveBeenLastCalledWith({
    method: "calendar.launchCancel",
    armId: "f".repeat(64),
  });
});
