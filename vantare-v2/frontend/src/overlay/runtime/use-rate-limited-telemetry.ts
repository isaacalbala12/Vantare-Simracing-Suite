import { useSyncExternalStore } from "react";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";

export function useRateLimitedTelemetry(
  coordinator: TelemetryRateCoordinator,
  hz: number,
): TelemetrySnapshot {
  return useSyncExternalStore(
    (onStoreChange) => coordinator.subscribe(hz, onStoreChange),
    () => coordinator.getSnapshot(hz),
    () => coordinator.getSnapshot(hz),
  );
}