// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  LauncherView,
} from "../src/contract/generated/contract";
import { coreKey } from "../src/renderer/app/Host";
import {
  defaultCalendarProfile,
  useCalendarLauncher,
} from "../src/renderer/screens/calendar/CalendarLauncher";

const host = vi.hoisted(() => ({
  client: {
    request: vi.fn(),
    listen: vi.fn(() => vi.fn()),
    subscribe: vi.fn(() => vi.fn()),
  },
  toast: vi.fn(),
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => host,
}));
vi.mock("../src/renderer/ui/Layers", () => ({
  useToastManager: () => ({ add: host.toast }),
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  host.client.request.mockReset();
  host.toast.mockClear();
});
function setup() {
  const view = structuredClone(launcherFixture) as LauncherView;
  view.profiles.forEach((profile) => {
    profile.launchable = true;
  });
  const core = structuredClone(coreFixture) as CoreStatus;
  core.rights = "connected";
  core.access.verified = true;
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  cache.setQueryData(coreKey, core);
  host.client.request.mockResolvedValue({
    method: "launcher.get",
    value: view,
  });
  const hook = renderHook(({ allowed }) => useCalendarLauncher(allowed), {
    initialProps: { allowed: true },
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, view, core, cache };
}
it("selects favorites then the same lexical minimum as GPUI, including non-BMP names", () => {
  const view = structuredClone(launcherFixture) as LauncherView;
  const first = {
    ...view.profiles[0],
    id: "scalar-first",
    name: "\uE000",
    favorite: true,
  };
  const second = { ...first, id: "utf16-first", name: "\u{10000}" };
  expect(defaultCalendarProfile([second, first])?.id).toBe("scalar-first");
  expect(
    defaultCalendarProfile([{ ...second, favorite: false, name: "A" }, first])
      ?.id,
  ).toBe("scalar-first");
  expect(
    defaultCalendarProfile([
      { ...second, favorite: false, name: "A" },
      { ...first, favorite: false, name: "Z" },
    ])?.id,
  ).toBe("utf16-first");
});
it("launches the selected profile with its observed revision and blocks a second pending send", async () => {
  const hook = setup();
  await act(async () => {});
  expect(hook.result.current.canLaunch).toBe(true);
  let finish: (value: unknown) => void = () => {};
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  act(() => {
    void hook.result.current.launch();
    void hook.result.current.launch();
  });
  expect(
    host.client.request.mock.calls.filter(
      ([request]) => request.method === "launcher.launch",
    ),
  ).toHaveLength(1);
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "launcher.launch",
    profile: hook.view.profiles[0].id,
    baseRevision: hook.view.revision,
  });
  await act(async () => {
    finish({ method: "launcher.launch", accepted: true });
  });
  expect(host.toast).toHaveBeenCalledOnce();
  expect(hook.result.current.busy).toBe(false);
});
it("drops an old acknowledgment when rights change and never launches while live", async () => {
  const hook = setup();
  await act(async () => {});
  let finish: (value: unknown) => void = () => {};
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  act(() => {
    void hook.result.current.launch();
  });
  hook.rerender({ allowed: false });
  await act(async () => {
    finish({ method: "launcher.launch", accepted: true });
  });
  expect(host.toast).not.toHaveBeenCalled();
  expect(hook.result.current.busy).toBe(false);
  hook.rerender({ allowed: true });
  host.client.request.mockResolvedValue({
    method: "launcher.get",
    value: hook.view,
  });
  await act(async () => {});
  act(() => hook.cache.setQueryData(coreKey, { ...hook.core, live: true }));
  await waitFor(() => expect(hook.result.current.canLaunch).toBe(false));
  const before = host.client.request.mock.calls.length;
  await act(async () => {
    await hook.result.current.launch();
  });
  expect(host.client.request.mock.calls).toHaveLength(before);
});
