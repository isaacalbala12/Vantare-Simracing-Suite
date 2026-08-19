export type FreshnessMeasurement = Readonly<{
  ageMs: number;
  stale: boolean;
}>;

export type FreshnessWatchdog = Readonly<{
  measure(capturedAt: string): FreshnessMeasurement;
  start(): void;
  stop(): void;
}>;

export type FreshnessWatchdogOptions = Readonly<{
  now?: () => number;
  staleAfterMs?: number;
  intervalMs?: number;
}>;

const DEFAULT_STALE_AFTER_MS = 1_000;
const DEFAULT_INTERVAL_MS = 100;

export function createFreshnessWatchdog(
  onTick: () => void,
  options: FreshnessWatchdogOptions = {},
): FreshnessWatchdog {
  const now = options.now ?? Date.now;
  const staleAfterMs = positiveOrDefault(
    options.staleAfterMs,
    DEFAULT_STALE_AFTER_MS,
  );
  const intervalMs = positiveOrDefault(
    options.intervalMs,
    DEFAULT_INTERVAL_MS,
  );
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    measure(capturedAt) {
      const capturedAtMs = Date.parse(capturedAt);
      const ageMs = Math.max(0, Math.floor(now() - capturedAtMs));
      return { ageMs, stale: ageMs >= staleAfterMs };
    },
    start() {
      timer ??= globalThis.setInterval(onTick, intervalMs);
    },
    stop() {
      if (timer === undefined) {
        return;
      }
      globalThis.clearInterval(timer);
      timer = undefined;
    },
  };
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
