import { createContext, useContext } from 'react';
import type { TelemetryRateCoordinator } from '../../../overlay/core/telemetry-rate-coordinator';
import type { WidgetRuntimeInput } from '../../../overlay/core/widget-definition';
import { useOverlayRuntimeContext, useRateLimitedWidgetTelemetry } from '../../../overlay/runtime/use-rate-limited-telemetry';
import type { OverlayRuntimeContext } from '../../../overlay/core/overlay-runtime-context';
import type { TelemetryActivityGate } from '../../../overlay/runtime/telemetry-activity-gate';

export type StudioTelemetryContextValue = {
  coordinator: TelemetryRateCoordinator;
  liveAvailable: boolean;
  active: boolean;
  activityGate: TelemetryActivityGate;
  runtime?: WidgetRuntimeInput;
};

export const StudioTelemetryContext = createContext<StudioTelemetryContextValue | null>(null);

export function useStudioTelemetryCoordinator(): TelemetryRateCoordinator {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioTelemetryCoordinator must be used inside StudioTelemetryProvider');
  return context.coordinator;
}

export function useStudioTelemetryLiveAvailable(): boolean {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioTelemetryLiveAvailable must be used inside StudioTelemetryProvider');
  return context.liveAvailable;
}

export function useStudioTelemetryRuntime(widgetType: string): WidgetRuntimeInput {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioTelemetryRuntime must be used inside StudioTelemetryProvider');
  const overlay = useRateLimitedWidgetTelemetry(context.coordinator, widgetType);
  return {
    ...context.runtime,
    overlayV2Frame: overlay.overlayV2Frame ?? context.runtime?.overlayV2Frame,
    overlayV2Source: overlay.overlayV2Source ?? context.runtime?.overlayV2Source,
    overlayV2Failure: overlay.overlayV2Failure ?? context.runtime?.overlayV2Failure,
  };
}

export function useStudioOverlayRuntimeContext(): OverlayRuntimeContext {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioOverlayRuntimeContext must be used inside StudioTelemetryProvider');
  return useOverlayRuntimeContext(context.coordinator);
}
