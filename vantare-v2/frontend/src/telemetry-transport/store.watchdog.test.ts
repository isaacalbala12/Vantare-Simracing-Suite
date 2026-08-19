import { afterEach, expect, test, vi } from "vitest";
import { eventName } from "./contracts";
import { createProjectionTransportStore } from "./store";

afterEach(() => {
  vi.useRealTimers();
});

test("un frame de hace 3 s se pinta como stale aunque el backend calle", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
  const store = createProjectionTransportStore("overlay");
  const unsubscribe = store.subscribe(() => undefined);
  store.ingest(eventName("overlay", "status"), {
    product: "overlay",
    statusRevision: 1,
    capturedAt: "2026-08-19T12:00:00Z",
    payload: { state: "live", reconnectAttempt: 0 },
  });
  store.ingest(eventName("overlay", "projection"), {
    product: "overlay",
    projectionVersion: 1,
    epoch: 1,
    sequence: 1,
    kind: "full",
    capturedAt: "2026-08-19T12:00:00Z",
    statusRevision: 1,
    payload: { speedKph: 220 },
  });

  vi.advanceTimersByTime(3_000);

  expect(store.getSnapshot()).toEqual(
    expect.objectContaining({
      ageMs: 3_000,
      status: expect.objectContaining({
        payload: { state: "stale", reconnectAttempt: 0 },
      }),
      snapshot: expect.objectContaining({ payload: { speedKph: 220 } }),
    }),
  );
  expect(
    store.getSnapshot().diagnostics.filter(
      ({ code }) => code === "snapshot-stale-watchdog",
    ),
  ).toHaveLength(1);

  unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
});
