import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./use-now";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useNow", () => {
  it("dos consumidores comparten un único intervalo", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(window, "setInterval");
    const clearSpy = vi.spyOn(window, "clearInterval");
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    expect(setSpy).toHaveBeenCalledTimes(1);
    a.unmount();
    expect(clearSpy).not.toHaveBeenCalled();
    b.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("avanza con el tick compartido", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNow());
    const before = result.current.getTime();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.getTime()).toBeGreaterThan(before);
  });

  it("con now inyectado no suscribe ni crea intervalo", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(window, "setInterval");
    const fixed = new Date("2026-09-11T12:00:00Z");
    const { result } = renderHook(() => useNow(fixed));
    expect(setSpy).not.toHaveBeenCalled();
    expect(result.current).toBe(fixed);
  });
});
