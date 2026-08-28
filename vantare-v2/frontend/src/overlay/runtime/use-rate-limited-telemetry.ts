import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { TelemetryRateCoordinator } from '../core/telemetry-rate-coordinator';
import type { TelemetrySnapshot } from '../core/telemetry-snapshot';
import type { OverlayFrameV2 } from '../../generated/telemetry';

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
  rateKey: number | string,
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
        unsubscribeCoordinator = coordinator.subscribe(rateKey, onStoreChange);
        if (notify) onStoreChange();
      };

      syncSubscription(false);
      const unsubscribeActivity = activityGate.subscribe(() => syncSubscription(true));
      return () => {
        unsubscribeActivity();
        unsubscribeCoordinator();
      };
    },
    [active, activityGate, coordinator, rateKey],
  );
  const getSnapshot = useCallback(() => coordinator.getSnapshot(rateKey), [coordinator, rateKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRateLimitedWidgetTelemetry(
  coordinator: TelemetryRateCoordinator,
  widgetType: string,
  initialOverlayFrame?: OverlayFrameV2,
): Readonly<{ snapshot: TelemetrySnapshot; overlayFrame?: OverlayFrameV2 }> {
  const [state, setState] = useState(() => ({
    snapshot: coordinator.getSnapshot(widgetType),
    overlayFrame: initialOverlayFrame ?? coordinator.getOverlayFrame(),
  }));

  useEffect(() => coordinator.subscribe(widgetType, () => {
    setState({
      snapshot: coordinator.getSnapshot(widgetType),
      overlayFrame: coordinator.getOverlayFrame(),
    });
  }), [coordinator, widgetType]);

  return state;
}
