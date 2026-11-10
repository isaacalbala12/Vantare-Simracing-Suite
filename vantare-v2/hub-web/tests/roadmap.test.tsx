import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  type Reply,
  roadmapRefreshMs,
} from "../src/contract/generated/contract";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import * as host from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import type { Client } from "../src/renderer/bridge/client";
import { pollRoadmap } from "../src/renderer/screens/roadmap/poll";
import { Roadmap } from "../src/renderer/screens/roadmap/Roadmap";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function publication() {
  const response = createMockHost("roadmap-published")({
    kind: "request",
    id: 1,
    request: { method: "roadmap.cached" },
  });
  if (
    response?.kind !== "response" ||
    response.result.method !== "roadmap.cached"
  )
    throw Error("fixture");
  return response.result.value.publication;
}
it("defaults to Board, preserves literal titles and switches all three presentations by keyboard", async () => {
  const user = userEvent.setup();
  const cache = new QueryClient();
  cache.setQueryData(["roadmap"], publication());
  render(
    <QueryClientProvider client={cache}>
      <SectionChromeProvider>
        <SectionTabsSlot />
        <Roadmap />
      </SectionChromeProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("tab", { name: "Tablero" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByText("Rework - Roadmap")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Circuito" }));
  expect(screen.getByText("En qué estamos")).toBeTruthy();
  await user.keyboard("{End}");
  expect(
    screen
      .getByRole("tab", { name: "Temporada" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByText(/sin garantía de release/)).toBeTruthy();
});
it("rejects open parameters and malformed public views", () => {
  expect(
    isUiMessage({
      kind: "request",
      id: 1,
      request: { method: "roadmap.refresh", url: "https://example.com" },
    }),
  ).toBe(false);
  const response = createMockHost("roadmap-published")({
    kind: "request",
    id: 1,
    request: { method: "roadmap.cached" },
  });
  expect(isHostMessage(response)).toBe(true);
  expect(
    isHostMessage({
      kind: "response",
      id: 1,
      result: {
        method: "roadmap.cached",
        value: {
          publication: {
            id: "x",
            publishedAt: "x",
            items: [{ section: "unknown" }],
          },
          stale: false,
        },
      },
    }),
  ).toBe(false);
  expect(
    isHostMessage({
      kind: "response",
      id: 1,
      result: {
        method: "roadmap.cached",
        value: { publication: null, stale: false, token: "no" },
      },
    }),
  ).toBe(false);
});
it("loads cache then refreshes, preserves publication on failure, throttles retry and stops when disposed", async () => {
  vi.useFakeTimers();
  let current = publication();
  let failed = false;
  const initial = current;
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      method: "roadmap.cached",
      value: { publication: current, stale: true },
    })
    .mockRejectedValue(Error("offline"));
  const stop = pollRoadmap(
    { request },
    (value, error) => {
      if (value?.publication) current = value.publication;
      failed = error;
    },
    () => true,
    { lastRefresh: -Infinity },
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(2);
  expect(failed).toBe(true);
  expect(current).toEqual(initial);
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs - 1);
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(request).toHaveBeenCalledTimes(3);
  stop();
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs);
  expect(request).toHaveBeenCalledTimes(3);
});
it("does not overlap requests or dispatch while hidden and ignores a late reply", async () => {
  vi.useFakeTimers();
  let visible = true;
  let resolve: (r: Reply) => void = () => {};
  const request = vi.fn(
    () =>
      new Promise<Reply>((done) => {
        resolve = done;
      }),
  );
  const publish = vi.fn();
  const stop = pollRoadmap({ request }, publish, () => visible, {
    lastRefresh: -Infinity,
  });
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs * 2);
  expect(request).toHaveBeenCalledTimes(1);
  stop();
  resolve({
    method: "roadmap.cached",
    value: { publication: publication(), stale: false },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(publish).toHaveBeenCalledTimes(1);
  visible = false;
  const stopHidden = pollRoadmap({ request }, publish, () => visible, {
    lastRefresh: -Infinity,
  });
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs);
  expect(request).toHaveBeenCalledTimes(1);
  stopHidden();
});

it("shares the refresh budget across leaving and re-entering the section", async () => {
  vi.useFakeTimers();
  const budget = { lastRefresh: -Infinity };
  const request = vi.fn().mockImplementation(async ({ method }) => ({
    method,
    value: { publication: publication(), stale: false },
  }));
  for (let entry = 0; entry < 5; entry++) {
    const stop = pollRoadmap(
      { request },
      () => {},
      () => true,
      budget,
    );
    await vi.advanceTimersByTimeAsync(0);
    stop();
  }
  expect(
    request.mock.calls.filter(([r]) => r.method === "roadmap.cached"),
  ).toHaveLength(5);
  expect(
    request.mock.calls.filter(([r]) => r.method === "roadmap.refresh"),
  ).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs);
  const stop = pollRoadmap(
    { request },
    () => {},
    () => true,
    budget,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(
    request.mock.calls.filter(([r]) => r.method === "roadmap.refresh"),
  ).toHaveLength(2);
  stop();
});
it("accepts an empty publication and displays its empty lanes", async () => {
  const empty = { id: "empty", publishedAt: "2026-11-10T00:00:00Z", items: [] };
  expect(
    isHostMessage({
      kind: "response",
      id: 1,
      result: {
        method: "roadmap.cached",
        value: { publication: empty, stale: false },
      },
    }),
  ).toBe(true);
  const cache = new QueryClient();
  cache.setQueryData(["roadmap"], empty);
  render(
    <QueryClientProvider client={cache}>
      <SectionChromeProvider>
        <SectionTabsSlot />
        <Roadmap />
      </SectionChromeProvider>
    </QueryClientProvider>,
  );
  expect(screen.getAllByText("Sin hitos publicados")).toHaveLength(3);
});
it("does not claim to have a saved publication when the cache is absent", async () => {
  vi.spyOn(host, "useHost").mockReturnValue({
    client: {
      request: vi.fn().mockResolvedValue({
        method: "roadmap.cached",
        value: { publication: null, stale: true },
      }),
    } as unknown as Client,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionChromeProvider>
        <SectionTabsSlot />
        <Roadmap />
      </SectionChromeProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Sin publicación disponible")).toBeTruthy();
  expect(screen.queryByText("Última publicación guardada")).toBeNull();
});
