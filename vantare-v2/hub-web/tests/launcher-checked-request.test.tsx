// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import * as host from "../src/renderer/app/Host";
import { useLauncherRequest } from "../src/renderer/app/LauncherRequest";
import { type Client, HostFailure } from "../src/renderer/bridge/client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount(generation: string | null = "a".repeat(64)) {
  const request = vi.fn().mockResolvedValue({
    method: "launcher.launchChecked",
    value: { kind: "queued", request: "b".repeat(32) },
  });
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  cache.setQueryData(host.coreKey, {
    ...host.offline,
    accountGeneration: generation,
  });
  const hook = renderHook(() => useLauncherRequest(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { hook, cache, request };
}
const launch = {
  method: "launcher.launchChecked",
  profile: "creator",
  baseRevision: "c".repeat(64),
} as const;
it("captures the observed account for launchChecked and returns queued without claiming completion", async () => {
  const { hook, request, cache } = mount();
  await act(async () => {
    const pending = hook.result.current.request(launch);
    cache.setQueryData(host.coreKey, {
      ...host.offline,
      accountGeneration: "d".repeat(64),
    });
    expect(await pending).toEqual({
      method: "launcher.launchChecked",
      value: { kind: "queued", request: "b".repeat(32) },
    });
  });
  expect(request).toHaveBeenCalledExactlyOnceWith({
    ...launch,
    armedGeneration: "a".repeat(64),
  });
});
it("does not send when the account generation is unavailable", async () => {
  const { hook, request } = mount(null);
  await expect(hook.result.current.request(launch)).rejects.toMatchObject({
    detail: { kind: "coreUnavailable" },
  });
  expect(request).not.toHaveBeenCalled();
});
it("never falls back to v1 or resends an unsupported or uncertain launch", async () => {
  for (const kind of ["unsupported", "coreUnavailable"] as const) {
    const { hook, request } = mount();
    request.mockRejectedValueOnce(new HostFailure({ kind }));
    await act(async () => {
      await expect(hook.result.current.request(launch)).rejects.toMatchObject({
        detail: { kind },
      });
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      ...launch,
      armedGeneration: "a".repeat(64),
    });
    hook.unmount();
  }
});
