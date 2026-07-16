import { buildMockTelemetry } from "./mock-scenarios";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

export type TelemetryListener = () => void;

export type TelemetryScheduler = {
  start(onTick: () => void): void;
  stop(): void;
};

export type TelemetryRateCoordinator = {
  getSnapshot(hz: number): TelemetrySnapshot;
  subscribe(hz: number, listener: TelemetryListener): () => void;
  publish(snapshot: TelemetrySnapshot): void;
  dispose(): void;
};

export type TelemetryRateCoordinatorOptions = {
  now?: () => number;
  createScheduler?: (hz: number) => TelemetryScheduler;
};

type BucketState = {
  listeners: Set<TelemetryListener>;
  scheduler: TelemetryScheduler;
};

function defaultScheduler(hz: number): TelemetryScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    start(onTick) {
      if (timer) {
        return;
      }
      const intervalMs = Math.max(1, Math.round(1000 / hz));
      timer = setInterval(onTick, intervalMs);
    },
    stop() {
      if (!timer) {
        return;
      }
      clearInterval(timer);
      timer = null;
    },
  };
}

function isImmediateStatus(status: TelemetrySnapshot["status"]): boolean {
  return status === "stale" || status === "disconnected" || status === "error";
}

function emptySnapshot(): TelemetrySnapshot {
  return buildMockTelemetry({
    session: "race",
    location: "track",
    state: "disconnected",
  });
}

export function createTelemetryRateCoordinator(
  options: TelemetryRateCoordinatorOptions = {},
): TelemetryRateCoordinator {
  const createScheduler = options.createScheduler ?? defaultScheduler;
  let latest = emptySnapshot();
  const buckets = new Map<number, BucketState>();

  const notifyBucket = (bucket: BucketState) => {
    for (const listener of bucket.listeners) {
      listener();
    }
  };

  const ensureBucket = (hz: number): BucketState => {
    const existing = buckets.get(hz);
    if (existing) {
      return existing;
    }
    const scheduler = createScheduler(hz);
    const bucket: BucketState = {
      listeners: new Set(),
      scheduler,
    };
    scheduler.start(() => {
      notifyBucket(bucket);
    });
    buckets.set(hz, bucket);
    return bucket;
  };

  return {
    getSnapshot(_hz: number) {
      return latest;
    },
    subscribe(hz, listener) {
      const bucket = ensureBucket(hz);
      bucket.listeners.add(listener);
      return () => {
        bucket.listeners.delete(listener);
        if (bucket.listeners.size === 0) {
          bucket.scheduler.stop();
          buckets.delete(hz);
        }
      };
    },
    publish(snapshot) {
      latest = snapshot;
      if (!isImmediateStatus(snapshot.status)) {
        return;
      }
      for (const bucket of buckets.values()) {
        notifyBucket(bucket);
      }
    },
    dispose() {
      for (const bucket of buckets.values()) {
        bucket.scheduler.stop();
        bucket.listeners.clear();
      }
      buckets.clear();
    },
  };
}