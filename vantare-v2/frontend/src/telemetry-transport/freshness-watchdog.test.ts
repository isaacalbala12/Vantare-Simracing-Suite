import { afterEach, describe, expect, it, vi } from "vitest";
import { createFreshnessWatchdog } from "./freshness-watchdog";

afterEach(() => {
  vi.useRealTimers();
});

describe("freshness watchdog", () => {
  it("uses the injected clock to classify frame age", () => {
    let now = Date.parse("2026-08-19T12:00:00Z");
    const watchdog = createFreshnessWatchdog(() => undefined, {
      now: () => now,
      staleAfterMs: 1_000,
    });

    expect(watchdog.measure("2026-08-19T11:59:59.001Z")).toEqual({
      ageMs: 999,
      stale: false,
    });
    now += 1;
    expect(watchdog.measure("2026-08-19T11:59:59.001Z")).toEqual({
      ageMs: 1_000,
      stale: true,
    });
  });

  it("owns and clears its interval", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const watchdog = createFreshnessWatchdog(tick);

    watchdog.start();
    watchdog.start();
    vi.advanceTimersByTime(300);
    expect(tick).toHaveBeenCalledTimes(3);

    watchdog.stop();
    vi.advanceTimersByTime(300);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
