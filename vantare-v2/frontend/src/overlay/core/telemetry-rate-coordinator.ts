import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { createDerivedTelemetryStore } from "./derived-telemetry-store";

export type TelemetryListener = () => void;

/**
 * A repaint scheduler drives one visual frame. It carries no frequency
 * domain: the display decides when to paint.
 */
export type TelemetryScheduler = {
  start(onFrame: () => void): void;
  stop(): void;
};

export type TelemetryRateCoordinator = {
  /** The `hz` argument is accepted for source compatibility and ignored. */
  getSnapshot(hz?: number): TelemetrySnapshot;
  /** The `hz` argument is accepted for source compatibility and ignored. */
  subscribe(hz: number | undefined, listener: TelemetryListener): () => void;
  publish(snapshot: TelemetrySnapshot): void;
  dispose(): void;
};

export type TelemetryRateCoordinatorOptions = {
  /** Accepted for source compatibility; the coordinator holds no clock. */
  now?: () => number;
  /** Injects the repaint loop. Defaults to requestAnimationFrame. */
  createScheduler?: () => TelemetryScheduler;
};

/**
 * Since ISA-372 / F11 the cadence is regulated in Go, before projecting and
 * serializing the frame. This coordinator is purely visual: it holds the
 * latest snapshot, and repaints subscribers once per animation frame when
 * something arrived. It never throttles, never buckets by frequency and never
 * decides which snapshot deserves an update.
 */
function defaultScheduler(): TelemetryScheduler {
  let handle: number | null = null;
  let stopped = false;
  const request: (callback: () => void) => number =
    typeof requestAnimationFrame === "function"
      ? (callback) => requestAnimationFrame(() => callback())
      : (callback) => setTimeout(callback, 16) as unknown as number;
  const cancel: (id: number) => void =
    typeof cancelAnimationFrame === "function"
      ? (id) => cancelAnimationFrame(id)
      : (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  return {
    start(onFrame) {
      if (handle !== null || stopped) {
        return;
      }
      const loop = () => {
        onFrame();
        if (!stopped) {
          handle = request(loop);
        }
      };
      handle = request(loop);
    },
    stop() {
      stopped = true;
      if (handle === null) {
        return;
      }
      cancel(handle);
      handle = null;
    },
  };
}

function emptySnapshot(): TelemetrySnapshot {
  return {
    status: "disconnected",
    capturedAt: 0,
    session: { type: "race" },
    player: { inPit: false },
    scoring: [],
  };
}

export function createTelemetryRateCoordinator(
  options: TelemetryRateCoordinatorOptions = {},
): TelemetryRateCoordinator {
  const createScheduler = options.createScheduler ?? defaultScheduler;
  let latest = emptySnapshot();
  const derived = createDerivedTelemetryStore();
  const listeners = new Set<TelemetryListener>();
  let scheduler: TelemetryScheduler | null = null;
  let pending = false;

  const paint = () => {
    if (!pending) {
      return;
    }
    pending = false;
    for (const listener of listeners) {
      listener();
    }
  };

  const ensureScheduler = () => {
    if (scheduler) {
      return;
    }
    scheduler = createScheduler();
    scheduler.start(paint);
  };

  const releaseScheduler = () => {
    if (!scheduler) {
      return;
    }
    scheduler.stop();
    scheduler = null;
  };

  return {
    getSnapshot() {
      return latest;
    },
    subscribe(_hz, listener) {
      ensureScheduler();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          releaseScheduler();
        }
      };
    },
    publish(snapshot) {
      derived.publish(snapshot);
      latest = {
        ...snapshot,
        derived: {
          fuelHistory: derived.getFuelHistory(),
          inputHistory: derived.getInputHistory(),
          deltaHistory: derived.getDeltaHistory(),
        },
      };
      pending = true;
    },
    dispose() {
      releaseScheduler();
      listeners.clear();
      pending = false;
      derived.dispose();
    },
  };
}
