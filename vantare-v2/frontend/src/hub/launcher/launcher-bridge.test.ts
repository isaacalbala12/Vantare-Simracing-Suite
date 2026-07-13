import { describe, expect, it, vi } from "vitest";

type EventHandler = (event: { data?: unknown }) => void;
const handlers = new Set<EventHandler>();
const order: string[] = [];

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((_name: string, handler: EventHandler) => {
      order.push("on");
      handlers.add(handler);
      return () => {
        order.push("off");
        handlers.delete(handler);
      };
    }),
    Emit: vi.fn((name: string) => {
      order.push(`emit:${name}`);
    }),
  },
}));

import { Events } from "@wailsio/runtime";
import {
  dispatchLauncherCommand,
  requestSnapshot,
  subscribeSnapshot,
} from "./launcher-bridge";

describe("launcher bridge", () => {
  it("registers the snapshot listener before requesting a snapshot", () => {
    order.length = 0;
    handlers.clear();

    const cleanup = subscribeSnapshot(vi.fn());
    requestSnapshot();

    expect(order).toEqual(["on", "emit:launcher:snapshot:get"]);
    cleanup();
  });

  it("forwards snapshots and cleans up idempotently", () => {
    handlers.clear();
    const listener = vi.fn();
    const cleanup = subscribeSnapshot(listener);
    const snapshot = { revision: 1 };
    handlers.forEach((handler) => handler({ data: snapshot }));

    expect(listener).toHaveBeenCalledWith(snapshot);
    cleanup();
    cleanup();
    expect(order.at(-1)).toBe("off");
  });

  it("dispatches typed commands through Wails", () => {
    dispatchLauncherCommand("launcher:app:path:set", { id: "obs", path: "x" });
    expect(Events.Emit).toHaveBeenCalledWith("launcher:app:path:set", {
      id: "obs",
      path: "x",
    });
  });
});
