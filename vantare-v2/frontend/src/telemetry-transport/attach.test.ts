import { describe, expect, it, vi } from "vitest";
import { attachProjectionTransport, subscribedEventNames } from "./attach";
import { eventName } from "./contracts";
import { createProjectionTransportStore } from "./store";

describe("attachProjectionTransport", () => {
  it("uses one shared listener set with idempotent teardown", () => {
    const listeners = new Map<string, (data: unknown) => void>();
    const removed: string[] = [];
    const source = {
      subscribe(name: string, listener: (data: unknown) => void) {
        listeners.set(name, listener);
        return () => {
          removed.push(name);
          listeners.delete(name);
        };
      },
    };
    const store = createProjectionTransportStore("overlay");
    const onError = vi.fn();
    const detach = attachProjectionTransport(store, source, onError);
    expect([...listeners.keys()]).toEqual(subscribedEventNames("overlay"));

    listeners.get(eventName("overlay", "status"))?.({
      product: "overlay",
      statusRevision: 1,
      capturedAt: "2026-07-30T00:00:00Z",
      payload: { state: "live", reconnectAttempt: 0 },
    });
    expect(store.getSnapshot().status?.payload.state).toBe("live");
    expect(onError).not.toHaveBeenCalled();

    detach();
    detach();
    expect(removed).toEqual(subscribedEventNames("overlay"));
    expect(listeners.size).toBe(0);
  });

  it("routes malformed events to a sanitized error boundary", () => {
    let listener: ((data: unknown) => void) | undefined;
    const store = createProjectionTransportStore("analysis");
    const onError = vi.fn();
    attachProjectionTransport(
      store,
      {
        subscribe(_name, next) {
          listener ??= next;
          return () => undefined;
        },
      },
      onError,
    );
    listener?.({ raw: "must-not-cross" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().diagnostics).toEqual([]);
  });

  it("rolls back listeners if mounting fails partway", () => {
    const removed = vi.fn();
    let calls = 0;
    const store = createProjectionTransportStore("strategy");
    expect(() =>
      attachProjectionTransport(store, {
        subscribe() {
          calls += 1;
          if (calls === 2) {
            throw new Error("mount failed");
          }
          return removed;
        },
      }),
    ).toThrow("mount failed");
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it("attempts every remover even when one teardown fails", () => {
    const removers = [vi.fn(), vi.fn(), vi.fn()];
    removers[0]!.mockImplementation(() => {
      throw new Error("first cleanup failed");
    });
    let index = 0;
    const detach = attachProjectionTransport(
      createProjectionTransportStore("engineer"),
      {
        subscribe() {
          return removers[index++]!;
        },
      },
    );
    expect(detach).toThrow("first cleanup failed");
    expect(removers.map((remove) => remove.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
  });
});
