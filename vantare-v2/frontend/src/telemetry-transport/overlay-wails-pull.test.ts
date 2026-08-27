import { describe, expect, it, vi } from "vitest";
import {
  createOverlayWailsPullClient,
  OVERLAY_PULL_CLOSE_ROUTE,
  OVERLAY_PULL_REQUEST_ROUTE,
} from "./overlay-wails-pull";

type PendingPull = {
  resolve(input: unknown): void;
};

async function flushResponse(pending: PendingPull[], input: unknown): Promise<void> {
  const current = pending.shift();
  if (!current) throw new Error("missing pending pull");
  current.resolve(input);
  await Promise.resolve();
  await Promise.resolve();
}

describe("overlay HTTP pull client", () => {
  it("acks only after processing and keeps one request in flight", async () => {
    const posted: Array<{ route: string; data: unknown }> = [];
    const pending: PendingPull[] = [];
    const scheduled: Array<() => void> = [];
    const onError = vi.fn();
    const client = createOverlayWailsPullClient({
      post(route, data) {
        posted.push({route, data});
        if (route === OVERLAY_PULL_CLOSE_ROUTE) return undefined;
        return new Promise((resolve) => pending.push({resolve}));
      },
      schedule(callback) {
        scheduled.push(callback);
        return callback;
      },
      cancel(handle) {
        const index = scheduled.indexOf(handle as () => void);
        if (index >= 0) scheduled.splice(index, 1);
      },
      createSessionID: () => "session-1",
      onError,
    });
    const v1Snapshots: unknown[] = [];
    const v2Snapshots: unknown[] = [];
    client.source.subscribe("telemetry:overlay:projection", (data) => v1Snapshots.push(data));
    client.source.subscribe("telemetry:overlay-v2:snapshot", (data) => v2Snapshots.push(data));

    client.start();
    expect(posted).toEqual([{
      route: OVERLAY_PULL_REQUEST_ROUTE,
      data: {sessionId: "session-1", ack: 0},
    }]);
    expect(pending).toHaveLength(1);

    await flushResponse(pending, {
      sessionId: "session-1",
      delivery: 1,
      events: [{name: "telemetry:overlay:projection", data: {sequence: 1}}],
    });
    expect(v1Snapshots).toEqual([{sequence: 1}]);
    expect(posted).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    // The next request is the acknowledgement. It does not exist until the
    // response body has been processed and the paced turn runs.
    scheduled.shift()?.();
    expect(posted.at(-1)).toEqual({
      route: OVERLAY_PULL_REQUEST_ROUTE,
      data: {sessionId: "session-1", ack: 1},
    });
    expect(pending).toHaveLength(1);

    await flushResponse(pending, {
      sessionId: "session-1",
      delivery: 2,
      events: [
        {name: "telemetry:overlay:projection", data: {sequence: 100}},
        {name: "telemetry:overlay-v2:snapshot", data: {revision: 100}},
      ],
    });
    expect(v1Snapshots).toEqual([{sequence: 1}, {sequence: 100}]);
    expect(v2Snapshots).toEqual([{revision: 100}]);
    expect(onError).not.toHaveBeenCalled();

    client.stop();
    expect(posted.at(-1)).toEqual({
      route: OVERLAY_PULL_CLOSE_ROUTE,
      data: {sessionId: "session-1", ack: 2},
    });
    expect(scheduled).toHaveLength(0);
  });

  it("ignores duplicate deliveries and rejects unknown event routes", async () => {
    const posted: Array<{route: string; data: unknown}> = [];
    const pending: PendingPull[] = [];
    const callbacks: Array<() => void> = [];
    const onError = vi.fn();
    const client = createOverlayWailsPullClient({
      post(route, data) {
        posted.push({route, data});
        if (route === OVERLAY_PULL_CLOSE_ROUTE) return undefined;
        return new Promise((resolve) => pending.push({resolve}));
      },
      schedule(callback) {
        callbacks.push(callback);
        return callback;
      },
      cancel: () => undefined,
      createSessionID: () => "current",
      onError,
    });
    const listener = vi.fn();
    client.source.subscribe("telemetry:overlay:projection", listener);
    client.start();

    await flushResponse(pending, {
      sessionId: "current",
      delivery: 1,
      events: [{name: "hub:unrelated", data: {private: true}}],
    });
    expect(listener).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    callbacks.shift()?.();
    const scheduledBeforeDuplicate = callbacks.length;
    await flushResponse(pending, {
      sessionId: "current",
      delivery: 1,
      events: [{name: "telemetry:overlay:projection", data: {sequence: 2}}],
    });
    expect(callbacks).toHaveLength(scheduledBeforeDuplicate);
    expect(listener).not.toHaveBeenCalled();
    expect(posted.filter(({route}) => route === OVERLAY_PULL_REQUEST_ROUTE)).toHaveLength(2);
  });
});
