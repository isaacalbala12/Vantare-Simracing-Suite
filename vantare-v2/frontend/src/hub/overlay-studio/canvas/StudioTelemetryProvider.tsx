import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { TelemetryRateCoordinator } from '../../../overlay/core/telemetry-rate-coordinator';
import type { TelemetryAdapter } from '../studio-overlay-telemetry';
import type { WidgetRuntimeInput } from '../../../overlay/core/widget-definition';
import { useStudioPreview } from '../state/studio-store';
import { StudioTelemetryContext, type StudioTelemetryContextValue } from './studio-telemetry';
import { useOrbitKeepAliveActivity } from '../../components/orbit/orbit-keep-alive-activity';
import { buildAuthoringV2ScenarioRuntime } from '../../../overlay/authoring/fixtures/authoring-v2-scenario-fixture';

export type StudioTelemetryProviderProps = {
  coordinator: TelemetryRateCoordinator;
  liveAvailable: boolean;
  telemetryAdapter?: TelemetryAdapter | null;
  /** Suspends React paints without restarting transport or losing the latest frame. */
  active?: boolean;
  runtime?: WidgetRuntimeInput;
  children: ReactNode;
};

export function StudioTelemetryProvider(props: StudioTelemetryProviderProps): React.ReactElement {
  const { coordinator, liveAvailable, telemetryAdapter = null, active = true, runtime, children } = props;
  const { preview } = useStudioPreview();
  const activityGate = useOrbitKeepAliveActivity();
  const mockSequenceRef = useRef(coordinator.getOverlayFrame()?.sequence ?? 0);

  // Single layout effect handles both mock frame and live adapter lifecycle.
  // Merged into one effect to eliminate race conditions between two independent
  // effect cleanup/re-run sequences. When source changes from "live" to "mock",
  // the live cleanup (telemetryAdapter.stop()) now runs before the mock frame
  // is set in the same effect body, eliminating the double-stop issue.
  // Uses useLayoutEffect so the mock frame is set before paint, ensuring
  // widgets render with correct telemetry data on first paint. The scenario
  // frame is built synchronously, so the first frame has data before paint.
  useLayoutEffect(() => {
    if (preview.source === 'mock') {
      // Mock mode publishes only V2: frame/source from the canonical scenario
      // fixture, never a legacy snapshot.
      const mockV2 = buildAuthoringV2ScenarioRuntime({
        session: preview.mockSession,
        location: preview.mockLocation,
        state: 'ready',
        widget: 'delta',
        system: 'vantare-original',
        variant: 'default',
      });
      if (!mockV2.overlayV2Frame || !mockV2.overlayV2Source) {
        throw new Error('StudioTelemetryProvider: el escenario V2 carece de frame/source');
      }
      // The provider owns authoring scenarios. Advance the envelope sequence
      // so the coordinator observes session/location changes even though the
      // canonical seed is deterministic.
      mockSequenceRef.current = Math.max(
        mockSequenceRef.current,
        coordinator.getOverlayFrame()?.sequence ?? 0,
        mockV2.overlayV2Frame.sequence,
      ) + 1;
      coordinator.setOverlayFrame(
        { ...mockV2.overlayV2Frame, sequence: mockSequenceRef.current },
        mockV2.overlayV2Source,
      );
    } else if (preview.source === 'live' && liveAvailable && telemetryAdapter) {
      // Relinquish the mock authority before the live adapter publishes. A
      // real frame can legitimately reuse the canonical fixture's
      // epoch+sequence; changing the source state prevents that first live
      // frame from being treated as a duplicate. Retain the frame shape so
      // widgets paint their disconnected placeholder while LMU connects.
      coordinator.setOverlayFrame(coordinator.getOverlayFrame(), { state: 'stopped' });
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
    () => ({ coordinator, liveAvailable, active, activityGate, runtime }),
    [active, activityGate, coordinator, liveAvailable, runtime],
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
  runtime?: WidgetRuntimeInput;
  children: ReactNode;
}): React.ReactElement {
  return (
    <StudioTelemetryProvider
      coordinator={props.coordinator}
      liveAvailable={props.liveAvailable ?? false}
      telemetryAdapter={props.telemetryAdapter ?? null}
      active={props.active}
      runtime={props.runtime}
    >
      {props.children}
    </StudioTelemetryProvider>
  );
}
