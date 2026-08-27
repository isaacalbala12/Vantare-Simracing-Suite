import { createContext, useContext } from 'react';
import type { TelemetryRateCoordinator } from '../../../overlay/core/telemetry-rate-coordinator';
import type { TelemetrySnapshot } from '../../../overlay/core/telemetry-snapshot';
import type { WidgetRuntimeInput } from '../../../overlay/core/widget-definition';
import { useRateLimitedTelemetry } from '../../../overlay/runtime/use-rate-limited-telemetry';
import type { TelemetryActivityGate } from '../../../overlay/runtime/use-rate-limited-telemetry';

const INSPECTOR_TELEMETRY_HZ = 30;

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

export function useStudioTelemetrySnapshot(hz = INSPECTOR_TELEMETRY_HZ): TelemetrySnapshot {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioTelemetrySnapshot must be used inside StudioTelemetryProvider');
  return useRateLimitedTelemetry(context.coordinator, hz, context.active, context.activityGate);
}

export function useStudioTelemetryRuntime(): WidgetRuntimeInput | undefined {
  const context = useContext(StudioTelemetryContext);
  if (!context)
    throw new Error('useStudioTelemetryRuntime must be used inside StudioTelemetryProvider');
  return context.runtime;
}
