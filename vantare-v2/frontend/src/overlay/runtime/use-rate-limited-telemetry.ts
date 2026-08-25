import { useCallback, useSyncExternalStore } from 'react';
import type { TelemetryRateCoordinator } from '../core/telemetry-rate-coordinator';
import type { TelemetrySnapshot } from '../core/telemetry-snapshot';

export type TelemetryActivityGate = {
  getActive(): boolean;
  subscribe(listener: (active: boolean) => void): () => void;
};

const alwaysActiveGate: TelemetryActivityGate = {
  getActive: () => true,
  subscribe: () => () => undefined,
};

export function useRateLimitedTelemetry(
  coordinator: TelemetryRateCoordinator,
  hz: number,
  active = true,
  activityGate: TelemetryActivityGate = alwaysActiveGate,
): TelemetrySnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let unsubscribeCoordinator: () => void = () => undefined;
      const syncSubscription = (notify: boolean) => {
        unsubscribeCoordinator();
        unsubscribeCoordinator = () => undefined;
        if (!active || !activityGate.getActive()) return;
        unsubscribeCoordinator = coordinator.subscribe(hz, onStoreChange);
        if (notify) onStoreChange();
      };

      syncSubscription(false);
      const unsubscribeActivity = activityGate.subscribe(() => syncSubscription(true));
      return () => {
        unsubscribeActivity();
        unsubscribeCoordinator();
      };
    },
    [active, activityGate, coordinator, hz],
  );
  const getSnapshot = useCallback(() => coordinator.getSnapshot(hz), [coordinator, hz]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
