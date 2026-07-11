import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import type { TelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { TelemetryAdapter } from "../../../overlay/transports/wails-telemetry-adapter";
import { useRateLimitedTelemetry } from "../../../overlay/runtime/use-rate-limited-telemetry";
import { useStudioPreview } from "../state/studio-store";

const INSPECTOR_TELEMETRY_HZ = 30;

type StudioTelemetryContextValue = {
  coordinator: TelemetryRateCoordinator;
  liveAvailable: boolean;
};

const StudioTelemetryContext = createContext<StudioTelemetryContextValue | null>(null);

export type StudioTelemetryProviderProps = {
  coordinator: TelemetryRateCoordinator;
  liveAvailable: boolean;
  telemetryAdapter?: TelemetryAdapter | null;
  children: ReactNode;
};

export function StudioTelemetryProvider(props: StudioTelemetryProviderProps): React.ReactElement {
  const { coordinator, liveAvailable, telemetryAdapter = null, children } = props;
  const { preview } = useStudioPreview();

  useEffect(() => {
    if (preview.source !== "mock") {
      return;
    }
    coordinator.publish(
      buildMockTelemetry({
        session: preview.mockSession,
        location: preview.mockLocation,
        state: "ready",
      }),
    );
  }, [coordinator, preview.mockLocation, preview.mockSession, preview.source]);

  useEffect(() => {
    if (!telemetryAdapter) {
      return;
    }
    if (preview.source === "live" && liveAvailable) {
      telemetryAdapter.start();
      return () => {
        telemetryAdapter.stop();
      };
    }
    telemetryAdapter.stop();
    return undefined;
  }, [liveAvailable, preview.source, telemetryAdapter]);

  const value = useMemo<StudioTelemetryContextValue>(
    () => ({ coordinator, liveAvailable }),
    [coordinator, liveAvailable],
  );

  return (
    <StudioTelemetryContext.Provider value={value}>{children}</StudioTelemetryContext.Provider>
  );
}

export function useStudioTelemetryCoordinator(): TelemetryRateCoordinator {
  const context = useContext(StudioTelemetryContext);
  if (!context) {
    throw new Error("useStudioTelemetryCoordinator must be used inside StudioTelemetryProvider");
  }
  return context.coordinator;
}

export function useStudioTelemetryLiveAvailable(): boolean {
  const context = useContext(StudioTelemetryContext);
  if (!context) {
    throw new Error("useStudioTelemetryLiveAvailable must be used inside StudioTelemetryProvider");
  }
  return context.liveAvailable;
}

export function useStudioTelemetrySnapshot(hz = INSPECTOR_TELEMETRY_HZ): TelemetrySnapshot {
  const coordinator = useStudioTelemetryCoordinator();
  return useRateLimitedTelemetry(coordinator, hz);
}

export function ConnectedStudioTelemetryProvider(props: {
  coordinator: TelemetryRateCoordinator;
  liveAvailable?: boolean;
  telemetryAdapter?: TelemetryAdapter | null;
  children: ReactNode;
}): React.ReactElement {
  return (
    <StudioTelemetryProvider
      coordinator={props.coordinator}
      liveAvailable={props.liveAvailable ?? false}
      telemetryAdapter={props.telemetryAdapter ?? null}
    >
      {props.children}
    </StudioTelemetryProvider>
  );
}