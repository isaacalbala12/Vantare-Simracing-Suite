import {
  normalizeLegacyTelemetry,
  snapshotFromDisconnected,
  snapshotFromError,
  snapshotFromStale,
} from "../core/telemetry-adapter";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";

export type WailsTelemetryOptions = {
  coordinator: TelemetryRateCoordinator;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
  now?: () => number;
  staleAfterMs?: number;
  parsePayload?: (data: unknown) => unknown;
};

export type TelemetryAdapter = {
  readonly coordinator: TelemetryRateCoordinator;
  start(): void;
  stop(): void;
};

export function createWailsTelemetryAdapter(options: WailsTelemetryOptions): TelemetryAdapter {
  const now = options.now ?? (() => Date.now());
  const staleAfterMs = options.staleAfterMs ?? 5_000;
  const parsePayload = options.parsePayload ?? ((data: unknown) => data);
  let unsubscribe: (() => void) | null = null;
  let started = false;
  let lastReadyAt = 0;
  let lastReadySnapshot = snapshotFromDisconnected(now());

  const publishStaleIfNeeded = () => {
    if (lastReadyAt === 0) {
      return;
    }
    if (now() - lastReadyAt >= staleAfterMs) {
      options.coordinator.publish(snapshotFromStale(lastReadySnapshot, now()));
      lastReadyAt = 0;
    }
  };

  let staleTimer: ReturnType<typeof setInterval> | null = null;

  return {
    coordinator: options.coordinator,
    start() {
      if (started) {
        return;
      }
      started = true;
      unsubscribe = options.subscribe("telemetry:update", (data) => {
        try {
          const snapshot = normalizeLegacyTelemetry(parsePayload(data), now());
          if (snapshot.status === "ready") {
            lastReadyAt = now();
            lastReadySnapshot = snapshot;
          } else {
            lastReadyAt = 0;
          }
          options.coordinator.publish(snapshot);
        } catch (error) {
          lastReadyAt = 0;
          options.coordinator.publish(
            snapshotFromError(now(), error instanceof Error ? error.message : "telemetry parse failed"),
          );
        }
      });
      staleTimer = setInterval(publishStaleIfNeeded, Math.max(250, Math.floor(staleAfterMs / 2)));
    },
    stop() {
      if (!started) {
        return;
      }
      started = false;
      unsubscribe?.();
      unsubscribe = null;
      if (staleTimer) {
        clearInterval(staleTimer);
        staleTimer = null;
      }
      lastReadyAt = 0;
      options.coordinator.publish(snapshotFromDisconnected(now()));
    },
  };
}