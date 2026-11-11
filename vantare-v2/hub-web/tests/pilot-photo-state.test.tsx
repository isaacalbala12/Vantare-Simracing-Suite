// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { PilotProvider, usePilot } from "../src/renderer/app/PilotState";
import { Client } from "../src/renderer/bridge/client";
import {
  encodePilotPhoto,
  openPilotPhoto,
} from "../src/renderer/screens/settings/pilot-photo";

vi.mock("../src/renderer/screens/settings/pilot-photo", () => ({
  openPilotPhoto: vi.fn(),
  encodePilotPhoto: vi.fn(),
}));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=cuenta-base");
});
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(openPilotPhoto).mockReset();
  vi.mocked(encodePilotPhoto).mockReset();
});
function mount() {
  const query = new QueryClient();
  caches.push(query);
  return renderHook(() => ({ pilot: usePilot(), host: useHost() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={query}>
        <HostProvider>
          <PilotProvider>{children}</PilotProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
}
function bitmap() {
  return { width: 800, height: 400, close: vi.fn() } as unknown as ImageBitmap;
}
const file = new File(["QA"], "photo.png");
it("retains a crop across rerenders and closes its bitmap exactly once on cancel", async () => {
  const image = bitmap();
  vi.mocked(openPilotPhoto).mockResolvedValue(image);
  const hook = mount();
  await act(() => hook.result.current.pilot.choosePhoto(file));
  expect(hook.result.current.pilot.dirty).toBe(true);
  act(() => hook.result.current.pilot.cropPhoto({ x: 0.3, y: 0.1, side: 0.5 }));
  hook.rerender();
  expect(hook.result.current.pilot.photo?.crop).toEqual({
    x: 0.3,
    y: 0.1,
    side: 0.5,
  });
  act(() => hook.result.current.pilot.cancelPhoto());
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(hook.result.current.pilot.photo).toBeUndefined();
  hook.unmount();
  expect(image.close).toHaveBeenCalledTimes(1);
});
it("closes a decoder result arriving after cancellation or unmount", async () => {
  let resolve!: (image: ImageBitmap) => void;
  vi.mocked(openPilotPhoto).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = mount();
  let task!: Promise<void>;
  act(() => {
    task = hook.result.current.pilot.choosePhoto(file);
  });
  hook.unmount();
  const image = bitmap();
  await act(async () => {
    resolve(image);
    await task;
  });
  expect(image.close).toHaveBeenCalledTimes(1);
});
it("does not save the old photo while a crop is unconfirmed, then applies only to the draft", async () => {
  const image = bitmap();
  vi.mocked(openPilotPhoto).mockResolvedValue(image);
  vi.mocked(encodePilotPhoto).mockReturnValue("/9j/QA");
  const request = vi.spyOn(Client.prototype, "request");
  const hook = mount();
  await waitFor(() => expect(hook.result.current.host.client).toBeTruthy());
  await act(() => hook.result.current.pilot.load());
  await act(() => hook.result.current.pilot.choosePhoto(file));
  await act(() => hook.result.current.pilot.save());
  expect(request.mock.calls.some(([r]) => r.method === "pilot.save")).toBe(
    false,
  );
  act(() => hook.result.current.pilot.applyPhoto());
  expect(hook.result.current.pilot.draft?.photo).toBe("/9j/QA");
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(hook.result.current.pilot.dirty).toBe(true);
  expect(request.mock.calls.some(([r]) => r.method === "pilot.save")).toBe(
    false,
  );
});
it("keeps the original photo and crop when encoding fails", async () => {
  const image = bitmap();
  vi.mocked(openPilotPhoto).mockResolvedValue(image);
  vi.mocked(encodePilotPhoto).mockImplementation(() => {
    throw new Error("canvas failure");
  });
  const hook = mount();
  await act(() => hook.result.current.pilot.choosePhoto(file));
  act(() => hook.result.current.pilot.applyPhoto());
  expect(hook.result.current.pilot.photoError).toBe(true);
  expect(hook.result.current.pilot.photo?.image).toBe(image);
  expect(image.close).not.toHaveBeenCalled();
});
it("vetoes a window close with an unconfirmed crop but Live releases it", async () => {
  const guards: Parameters<Client["addCloseGuard"]>[0][] = [];
  const add = Client.prototype.addCloseGuard;
  vi.spyOn(Client.prototype, "addCloseGuard").mockImplementation(function (
    this: Client,
    guard,
  ) {
    guards.push(guard);
    return add.call(this, guard);
  });
  const image = bitmap();
  vi.mocked(openPilotPhoto).mockResolvedValue(image);
  const hook = mount();
  await waitFor(() => expect(guards.length).toBe(1));
  await act(() => hook.result.current.pilot.choosePhoto(file));
  await act(async () => {
    expect(await guards[0]("window")).toBe(false);
  });
  await act(async () => {
    expect(await guards[0]("live")).toBe(true);
  });
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(hook.result.current.pilot.photo).toBeUndefined();
});
