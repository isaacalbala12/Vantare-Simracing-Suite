// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  once: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
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
