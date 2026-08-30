import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { TelemetryRateCoordinator } from '../core/telemetry-rate-coordinator';
import type { OverlayFrameV2, OverlaySourceStatusV2 } from '../../generated/telemetry';
import type { OverlayRuntimeContext } from '../core/overlay-runtime-context';
import type { WidgetRuntimeInput } from '../core/widget-definition';

export function useRateLimitedWidgetTelemetry(
  coordinator: TelemetryRateCoordinator,
  widgetType: string,
): Readonly<{
  overlayV2Frame?: OverlayFrameV2;
  overlayV2Source?: OverlaySourceStatusV2;
  overlayV2Failure?: WidgetRuntimeInput['overlayV2Failure'];
}> {
  const [state, setState] = useState(() => ({
    overlayV2Frame: coordinator.getOverlayFrame(),
    overlayV2Source: coordinator.getOverlaySource(),
    overlayV2Failure: coordinator.getOverlayFailure(),
  }));

  useLayoutEffect(() => coordinator.subscribe(widgetType, () => {
    setState({
      overlayV2Frame: coordinator.getOverlayFrame(),
      overlayV2Source: coordinator.getOverlaySource(),
      overlayV2Failure: coordinator.getOverlayFailure(),
    });
  }), [coordinator, widgetType]);

  return state;
}

export function useOverlayRuntimeContext(
  coordinator: TelemetryRateCoordinator,
): OverlayRuntimeContext {
  const subscribe = useCallback(
    (listener: () => void) => coordinator.subscribe('runtime-context', listener),
    [coordinator],
  );
  const getSnapshot = useCallback(() => coordinator.getOverlayRuntimeContext(), [coordinator]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
