import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { isRendererMessage } from "../src/main/security";
import { bindWindowControls } from "../src/main/window-controls";
import { createMockHost } from "../src/mock/host";

function target() {
  let maximized = false;
  const events = new EventEmitter();
  return Object.assign(events, {
    isDestroyed: vi.fn(() => false),
    isMaximized: () => maximized,
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      maximized = true;
      events.emit("maximize");
    }),
    unmaximize: vi.fn(() => {
      maximized = false;
      events.emit("unmaximize");
    }),
  });
}
describe("closed main-process window actions", () => {
  it("accepts only a boolean state without extra capabilities", () => {
    expect(
      isHostMessage({
        kind: "event",
        event: { topic: "windowState", maximized: true },
      }),
    ).toBe(true);
    for (const event of [
      { topic: "windowState", maximized: "yes" },
      { topic: "windowState" },
      { topic: "windowState", maximized: true, pid: 123 },
    ])
      expect(isHostMessage({ kind: "event", event })).toBe(false);
  });
  it("rejects state announcements from the renderer", () => {
    expect(
      isRendererMessage({
        kind: "event",
        event: { topic: "windowState", maximized: true },
      }),
    ).toBe(false);
  });
  it("minimizes only its own window and toggles maximize/restore", () => {
    const window = target();
    const messages: HostToUi[] = [];
    const bridge = bindWindowControls(window, (message) =>
      messages.push(message),
    );
    bridge.dispatch({ kind: "subscribe", topic: "windowState" });
    expect(messages.pop()).toEqual({
      kind: "event",
      event: { topic: "windowState", maximized: false },
    });
    bridge.dispatch({
      kind: "request",
      id: 1,
      request: { method: "window.minimize" },
    });
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(messages.pop()).toEqual({
      kind: "response",
      id: 1,
      result: { method: "window.minimize", accepted: true },
    });
    for (const maximized of [true, false]) {
      bridge.dispatch({
        kind: "request",
        id: 2,
        request: { method: "window.toggleMaximize" },
      });
      expect(window.isMaximized()).toBe(maximized);
      expect(messages.splice(0)).toEqual([
        { kind: "event", event: { topic: "windowState", maximized } },
        {
          kind: "response",
          id: 2,
          result: { method: "window.toggleMaximize", accepted: true },
        },
      ]);
    }
    bridge.dispose();
  });
  it("reports OS-driven state changes and removes subscriptions/listeners on reload", () => {
    const window = target();
    const first = vi.fn();
    const old = bindWindowControls(window, first);
    old.dispatch({ kind: "subscribe", topic: "windowState" });
    old.dispose();
    const second = vi.fn();
    const current = bindWindowControls(window, second);
    current.dispatch({ kind: "subscribe", topic: "windowState" });
    window.maximize();
    expect(window.listenerCount("maximize")).toBe(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith({
      kind: "event",
      event: { topic: "windowState", maximized: true },
    });
    current.dispatch({ kind: "unsubscribe", topic: "windowState" });
    window.unmaximize();
    expect(second).toHaveBeenCalledTimes(2);
    current.dispose();
    expect(window.listenerCount("maximize")).toBe(0);
    expect(window.listenerCount("unmaximize")).toBe(0);
  });
  it("leaves close with the existing host guard and handles a destroyed window", () => {
    const window = target();
    const post = vi.fn();
    const bridge = bindWindowControls(window, post);
    expect(
      bridge.dispatch({
        kind: "request",
        id: 0,
        request: { method: "window.close" },
      }),
    ).toBe(false);
    expect(post).not.toHaveBeenCalled();
    window.isDestroyed.mockReturnValue(true);
    bridge.dispatch({
      kind: "request",
      id: 3,
      request: { method: "window.minimize" },
    });
    expect(window.minimize).not.toHaveBeenCalled();
    expect(post).toHaveBeenLastCalledWith({
      kind: "response",
      id: 3,
      result: { method: "window.minimize", accepted: false },
    });
    bridge.dispose();
  });
  it("returns an explicit error on a native failure", () => {
    const window = target();
    window.maximize.mockImplementation(() => {
      throw new Error("native failure");
    });
    const post = vi.fn();
    const bridge = bindWindowControls(window, post);
    bridge.dispatch({
      kind: "request",
      id: 4,
      request: { method: "window.toggleMaximize" },
    });
    expect(post).toHaveBeenCalledWith({
      kind: "failure",
      id: 4,
      error: { kind: "io" },
    });
    bridge.dispose();
  });
  it.each(["window.minimize", "window.toggleMaximize", "window.close"])(
    "rejects parameters and target substitution for %s",
    (method) => {
      expect(
        isRendererMessage({ kind: "request", id: 1, request: { method } }),
      ).toBe(true);
      for (const extra of [{ pid: 123 }, { window: "another" }, { args: [] }])
        expect(
          isRendererMessage({
            kind: "request",
            id: 1,
            request: { method, ...extra },
          }),
        ).toBe(false);
    },
  );
});

it("keeps mock window state per session and emits its typed change", async () => {
  const events: HostToUi[] = [];
  const first = createMockHost("ajustes-base", (event) => events.push(event));
  const second = createMockHost();
  expect(
    first({
      kind: "request",
      id: 31,
      request: { method: "window.toggleMaximize" },
    }),
  ).toEqual({
    kind: "response",
    id: 31,
    result: { method: "window.toggleMaximize", accepted: true },
  });
  await Promise.resolve();
  expect(events).toEqual([
    { kind: "event", event: { topic: "windowState", maximized: true } },
  ]);
  expect(first({ kind: "subscribe", topic: "windowState" })).toEqual(events[0]);
  expect(second({ kind: "subscribe", topic: "windowState" })).toEqual({
    kind: "event",
    event: { topic: "windowState", maximized: false },
  });
});
