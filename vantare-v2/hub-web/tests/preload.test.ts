// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRendererIsolation } from "../scripts/preload-surface";

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  once: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  zoom: vi.fn(() => 1.25),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  webFrame: { getZoomFactor: mocks.zoom },
  ipcRenderer: {
    once: mocks.once,
    removeListener: mocks.remove,
    send: mocks.send,
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.clearAllMocks();
});
describe("preload connection", () => {
  it("satisfies the same closed surface checked by the Windows smoke, regardless of insertion order", async () => {
    await import("../src/preload/index");
    const bridge = Object.keys(mocks.expose.mock.calls[0][1]);
    expect(() =>
      assertRendererIsolation({ node: "undefined", bridge }),
    ).not.toThrow();
    expect(() =>
      assertRendererIsolation({
        node: "undefined",
        bridge: [...bridge].reverse(),
      }),
    ).not.toThrow();
    expect(() =>
      assertRendererIsolation({
        node: "undefined",
        bridge: bridge.filter((key) => key !== "viewport"),
      }),
    ).toThrow();
    expect(() =>
      assertRendererIsolation({
        node: "undefined",
        bridge: [...bridge, "execute"],
      }),
    ).toThrow();
    expect(() =>
      assertRendererIsolation({ node: "function", bridge }),
    ).toThrow();
  });
  it("reports the precise DIP client area without the invisible Windows frame or an IPC request", async () => {
    vi.stubGlobal("outerWidth", 1936);
    vi.stubGlobal("outerHeight", 1088);
    vi.stubGlobal("visualViewport", { width: 1536, height: 864 });
    try {
      await import("../src/preload/index");
      const api = mocks.expose.mock.calls[0][1] as {
        viewport: () => { width: number; height: number };
      };
      expect(api.viewport()).toEqual({ width: 1920, height: 1080 });
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects an ignored request within a deadline and permits a clean retry", async () => {
    vi.useFakeTimers();
    await import("../src/preload/index");
    const api = mocks.expose.mock.calls[0][1] as {
      connect: () => Promise<void>;
    };
    const failure = expect(api.connect()).rejects.toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(10000);
    await failure;
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    const retryFailure = expect(api.connect()).rejects.toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(10000);
    await retryFailure;
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
