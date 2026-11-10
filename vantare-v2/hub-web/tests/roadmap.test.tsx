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
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { pollRoadmap } from "../src/renderer/screens/roadmap/poll";
import { Roadmap } from "../src/renderer/screens/roadmap/Roadmap";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
          publication: { id: "x", publishedAt: "x", items: [] },
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
  const stop = pollRoadmap({ request }, publish, () => visible);
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
  const stopHidden = pollRoadmap({ request }, publish, () => visible);
  await vi.advanceTimersByTimeAsync(roadmapRefreshMs);
  expect(request).toHaveBeenCalledTimes(1);
  stopHidden();
});
