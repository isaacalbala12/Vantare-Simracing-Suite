import {
  normalizeLegacyTelemetry,
  snapshotFromDisconnected,
  snapshotFromError,
  snapshotFromStale,
} from "../core/telemetry-adapter";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetryAdapter } from "./wails-telemetry-adapter";

export type EventSourceLike = {
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
  close(): void;
};

export type SseTelemetryOptions = {
  coordinator: TelemetryRateCoordinator;
  url: string;
  createEventSource?: (url: string) => EventSourceLike;
  now?: () => number;
  staleAfterMs?: number;
  parsePayload?: (data: unknown) => unknown;
};

export function createSseTelemetryAdapter(options: SseTelemetryOptions): TelemetryAdapter {
  const now = options.now ?? (() => Date.now());
  const staleAfterMs = options.staleAfterMs ?? 5_000;
  const parsePayload = options.parsePayload ?? ((data: unknown) => data);
  const createEventSource = options.createEventSource ?? ((url: string) => new EventSource(url));
  let source: EventSourceLike | null = null;
  let started = false;
  let lastReadyAt = 0;
  let lastReadySnapshot = snapshotFromDisconnected(now());
  let staleTimer: ReturnType<typeof setInterval> | null = null;

  const publishStaleIfNeeded = () => {
    if (lastReadyAt === 0) {
      return;
    }
    if (now() - lastReadyAt >= staleAfterMs) {
      options.coordinator.publish(snapshotFromStale(lastReadySnapshot, now()));
      lastReadyAt = 0;
    }
  };

  return {
    coordinator: options.coordinator,
    start() {
      if (started) {
        return;
      }
      started = true;
      source = createEventSource(options.url);
      source.addEventListener("telemetry", (event) => {
        try {
          const snapshot = normalizeLegacyTelemetry(parsePayload(event.data), now());
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
      source.addEventListener("error", () => {
        lastReadyAt = 0;
        options.coordinator.publish(snapshotFromDisconnected(now()));
      });
      staleTimer = setInterval(publishStaleIfNeeded, Math.max(250, Math.floor(staleAfterMs / 2)));
    },
    stop() {
      if (!started) {
        return;
      }
      started = false;
      source?.close();
      source = null;
      if (staleTimer) {
        clearInterval(staleTimer);
        staleTimer = null;
      }
      lastReadyAt = 0;
      options.coordinator.publish(snapshotFromDisconnected(now()));
    },
  };
}