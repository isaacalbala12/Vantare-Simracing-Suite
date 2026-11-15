// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVisibleNow } from "../src/renderer/ui/useVisibleNow";

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function visibility(value: boolean) {
  act(() => {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
it("stops the visual clock while hidden and resumes immediately without a catch-up burst", () => {
  const hook = renderHook(() => useVisibleNow(1000));
  act(() => vi.advanceTimersByTime(2000));
  expect(hook.result.current).toBe(3000);
  expect(vi.getTimerCount()).toBe(1);
  visibility(true);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(60 * 60 * 1000));
  expect(hook.result.current).toBe(3000);
  visibility(false);
  expect(hook.result.current).toBe(3603000);
  expect(vi.getTimerCount()).toBe(1);
  visibility(false);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(hook.result.current).toBe(3604000);
});
it("does not start in a hidden document and reflects a wall-clock change when restored", () => {
  hidden = true;
  const hook = renderHook(() => useVisibleNow(1000));
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.setSystemTime(new Date("2026-10-25T02:30:00Z")));
  visibility(false);
  expect(hook.result.current).toBe(Date.parse("2026-10-25T02:30:00Z"));
  expect(vi.getTimerCount()).toBe(1);
});
it("cleans up and replaces just one timer through rights changes and StrictMode", () => {
  const hook = renderHook(({ enabled }) => useVisibleNow(1000, enabled), {
    initialProps: { enabled: false },
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
  expect(vi.getTimerCount()).toBe(0);
  hook.rerender({ enabled: true });
  expect(vi.getTimerCount()).toBe(1);
  hook.rerender({ enabled: false });
  expect(vi.getTimerCount()).toBe(0);
  visibility(true);
  hook.rerender({ enabled: true });
  expect(vi.getTimerCount()).toBe(0);
  visibility(false);
  expect(vi.getTimerCount()).toBe(1);
  hook.unmount();
  visibility(false);
  expect(vi.getTimerCount()).toBe(0);
});
