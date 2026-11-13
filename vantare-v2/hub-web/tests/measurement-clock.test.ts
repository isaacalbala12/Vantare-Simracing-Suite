import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});
it("keeps the live product clock outside the measurement build", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T08:00:00Z"));
  const module = await import("../src/measurement");
  expect(module.measurementHome).toBe(false);
  expect(module.homeNow().getTime()).toBe(Date.now());
});
it("freezes only the display date in the dedicated build, without changing timers", async () => {
  vi.resetModules();
  vi.stubGlobal("__VANTARE_MEASUREMENT_HOME__", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T08:00:00Z"));
  const module = await import("../src/measurement");
  expect(module.measurementHome).toBe(true);
  expect(module.homeNow().toISOString()).toBe("2026-09-30T17:00:00.000Z");
  expect(new Date().toISOString()).toBe("2026-11-13T08:00:00.000Z");
});
