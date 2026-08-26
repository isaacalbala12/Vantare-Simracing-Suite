import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { buildMockTelemetry } from '../../../overlay/core/mock-scenarios';
import type { TelemetryRateCoordinator } from '../../../overlay/core/telemetry-rate-coordinator';
import type { TelemetryAdapter } from '../../../overlay/transports/telemetry-adapter';
import { useStudioPreview } from '../state/studio-store';
import { StudioTelemetryContext, type StudioTelemetryContextValue } from './studio-telemetry';
import { useOrbitKeepAliveActivity } from '../../components/orbit/orbit-keep-alive-activity';

export type StudioTelemetryProviderProps = {
  coordinator: TelemetryRateCoordinator;
  liveAvailable: boolean;
  telemetryAdapter?: TelemetryAdapter | null;
  /** Suspends React paints without restarting transport or losing the latest snapshot. */
  active?: boolean;
  children: ReactNode;
};

export function StudioTelemetryProvider(props: StudioTelemetryProviderProps): React.ReactElement {
  const { coordinator, liveAvailable, telemetryAdapter = null, active = true, children } = props;
  const { preview } = useStudioPreview();
  const activityGate = useOrbitKeepAliveActivity();

  // Single layout effect handles both mock publishing and live adapter lifecycle.
  // Merged into one effect to eliminate race conditions between two independent
  // effect cleanup/re-run sequences. When source changes from "live" to "mock",
  // the live cleanup (telemetryAdapter.stop()) now runs before the mock publish
  // happens in the same effect body, eliminating the double-stop issue.
  // Uses useLayoutEffect so mock publish happens before paint, ensuring widgets
  // render with correct telemetry data on first paint. Mock data is generated
  // synchronously, so publishing before paint ensures the first frame has data.
  useLayoutEffect(() => {
    if (preview.source === 'mock') {
      // Publish mock snapshot when in mock mode
      coordinator.publish(
        buildMockTelemetry({
          session: preview.mockSession,
          location: preview.mockLocation,
          state: 'ready',
        }),
      );
    } else if (preview.source === 'live' && liveAvailable && telemetryAdapter) {
      // Start live adapter when in live mode
      telemetryAdapter.start();
      // Cleanup stops adapter when source changes or component unmounts
      return () => {
        telemetryAdapter.stop();
      };
    }
  }, [
    coordinator,
    liveAvailable,
    preview.mockLocation,
    preview.mockSession,
    preview.source,
    telemetryAdapter,
  ]);

  const value = useMemo<StudioTelemetryContextValue>(
    () => ({ coordinator, liveAvailable, active, activityGate }),
    [active, activityGate, coordinator, liveAvailable],
  );

  return (
    <StudioTelemetryContext.Provider value={value}>{children}</StudioTelemetryContext.Provider>
  );
}

export function ConnectedStudioTelemetryProvider(props: {
  coordinator: TelemetryRateCoordinator;
  liveAvailable?: boolean;
  telemetryAdapter?: TelemetryAdapter | null;
  active?: boolean;
  children: ReactNode;
}): React.ReactElement {
  return (
    <StudioTelemetryProvider
      coordinator={props.coordinator}
      liveAvailable={props.liveAvailable ?? false}
      telemetryAdapter={props.telemetryAdapter ?? null}
      active={props.active}
    >
      {props.children}
    </StudioTelemetryProvider>
  );
}
