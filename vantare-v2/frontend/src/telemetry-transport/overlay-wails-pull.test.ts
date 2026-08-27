import { describe, expect, it, vi } from "vitest";
import {
  createOverlayWailsPullClient,
  OVERLAY_PULL_CLOSE_EVENT,
  OVERLAY_PULL_REQUEST_EVENT,
  OVERLAY_PULL_RESPONSE_EVENT,
} from "./overlay-wails-pull";

describe("overlay Wails pull client", () => {
  it("acks only after processing and keeps one delivery in flight", () => {
    const emitted: Array<{ name: string; data: unknown }> = [];
    const scheduled: Array<() => void> = [];
    let response: ((data: unknown) => void) | undefined;
    const onError = vi.fn();
    const client = createOverlayWailsPullClient({
      onResponse(name, listener) {
        expect(name).toBe(OVERLAY_PULL_RESPONSE_EVENT);
        response = listener;
        return () => {
          response = undefined;
        };
      },
      emit(name, data) {
        emitted.push({ name, data });
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
    expect(emitted).toEqual([{
      name: OVERLAY_PULL_REQUEST_EVENT,
      data: { sessionId: "session-1", ack: 0 },
    }]);

    response?.({
      sessionId: "session-1",
      delivery: 1,
      events: [{ name: "telemetry:overlay:projection", data: { sequence: 1 } }],
    });
    expect(v1Snapshots).toEqual([{ sequence: 1 }]);
    expect(emitted).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    // The next request is the acknowledgement. It does not exist until the
    // response callback has processed every event and the paced turn runs.
    scheduled.shift()?.();
    expect(emitted.at(-1)).toEqual({
      name: OVERLAY_PULL_REQUEST_EVENT,
      data: { sessionId: "session-1", ack: 1 },
    });

    response?.({
      sessionId: "session-1",
      delivery: 2,
      events: [
        { name: "telemetry:overlay:projection", data: { sequence: 100 } },
        { name: "telemetry:overlay-v2:snapshot", data: { revision: 100 } },
      ],
    });
    expect(v1Snapshots).toEqual([{ sequence: 1 }, { sequence: 100 }]);
    expect(v2Snapshots).toEqual([{ revision: 100 }]);
    expect(onError).not.toHaveBeenCalled();

    client.stop();
    expect(emitted.at(-1)).toEqual({
      name: OVERLAY_PULL_CLOSE_EVENT,
      data: { sessionId: "session-1", ack: 2 },
    });
    expect(response).toBeUndefined();
    expect(scheduled).toHaveLength(0);
  });

  it("ignores stale generations, duplicate deliveries and unknown event routes", () => {
    const emitted: Array<{ name: string; data: unknown }> = [];
    const callbacks: Array<() => void> = [];
    let response: ((data: unknown) => void) | undefined;
    const onError = vi.fn();
    const client = createOverlayWailsPullClient({
      onResponse(_name, listener) {
        response = listener;
        return () => undefined;
      },
      emit: (name, data) => emitted.push({ name, data }),
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

    response?.({sessionId: "stale", delivery: 1, events: []});
    response?.({
      sessionId: "current",
      delivery: 1,
      events: [{name: "hub:unrelated", data: {private: true}}],
    });
    expect(listener).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    // Delivery 1 was accepted once. Replaying it cannot schedule or dispatch
    // another turn.
    const scheduledBeforeDuplicate = callbacks.length;
    response?.({
      sessionId: "current",
      delivery: 1,
      events: [{name: "telemetry:overlay:projection", data: {sequence: 2}}],
    });
    expect(callbacks).toHaveLength(scheduledBeforeDuplicate);
    expect(listener).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(1);
  });
});
