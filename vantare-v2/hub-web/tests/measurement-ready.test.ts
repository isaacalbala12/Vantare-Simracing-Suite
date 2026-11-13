import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { measurementReadyScript } from "../src/main/measurement-ready";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("waits for Home data, fonts, images and two frames before announcing readiness", async () => {
  vi.useFakeTimers();
  const fonts = deferred(),
    image = deferred();
  const dataset: Record<string, string> = {};
  const frames: Array<() => void> = [];
  let done = false;
  const ready = runInNewContext(measurementReadyScript, {
    document: {
      documentElement: { dataset },
      fonts: { ready: fonts.promise },
      images: [{ decode: () => image.promise }],
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  }) as Promise<void>;
  void ready.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(10);
  expect(done).toBe(false);
  dataset.vantareMeasurementReady = "1";
  await vi.advanceTimersByTimeAsync(10);
  expect(frames).toHaveLength(0);
  fonts.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(frames).toHaveLength(0);
  image.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(frames).toHaveLength(1);
  frames.shift()?.();
  expect(done).toBe(false);
  expect(frames).toHaveLength(1);
  frames.shift()?.();
  await ready;
  expect(done).toBe(true);
});
it("rejects a stalled initialization instead of reporting it as interactive", async () => {
  vi.useFakeTimers();
  const ready = runInNewContext(measurementReadyScript, {
    document: {
      documentElement: { dataset: { vantareMeasurementReady: "1" } },
      fonts: { ready: deferred().promise },
      images: [],
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: vi.fn(),
  }) as Promise<void>;
  const rejected = expect(ready).rejects.toThrow("Home readiness timed out");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
});
