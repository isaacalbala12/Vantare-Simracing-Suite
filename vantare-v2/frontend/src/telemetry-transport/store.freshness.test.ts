import { afterEach, expect, test, vi } from "vitest";
import { eventName } from "./contracts";
import { createProjectionTransportStore } from "./store";

afterEach(() => {
  vi.useRealTimers();
});

test("degrada a stale cuando capturedAt supera el umbral", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
  const store = createProjectionTransportStore("engineer");
  store.ingest(eventName("engineer", "status"), {
    product: "engineer",
    statusRevision: 1,
    capturedAt: "2026-08-19T11:59:58Z",
    payload: { state: "live", reconnectAttempt: 0 },
  });
  expect(store.getSnapshot().status?.payload.state).toBe("stale");
  expect(store.getSnapshot().ageMs).toBe(2_000);
});
