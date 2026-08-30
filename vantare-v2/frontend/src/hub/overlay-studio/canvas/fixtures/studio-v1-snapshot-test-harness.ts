import { useCallback, useContext, useSyncExternalStore } from "react";
import type { TelemetrySnapshot } from "../../../../overlay/core/telemetry-snapshot";
import { StudioTelemetryContext } from "../studio-telemetry";

const TEST_TELEMETRY_HZ = 30;

export function useStudioV1SnapshotTestHarness(): TelemetrySnapshot {
  const context = useContext(StudioTelemetryContext);
  if (!context) throw new Error("Studio V1 test harness requires StudioTelemetryProvider");
  const { active, activityGate, coordinator } = context;
  const subscribe = useCallback((notify: () => void) => {
    let unsubscribeCoordinator: () => void = () => undefined;
    const sync = () => {
      unsubscribeCoordinator();
      unsubscribeCoordinator = () => undefined;
      if (active && activityGate.getActive()) {
        unsubscribeCoordinator = coordinator.subscribe(TEST_TELEMETRY_HZ, notify);
      }
    };
    sync();
    const unsubscribeActivity = activityGate.subscribe(() => {
      sync();
      notify();
    });
    return () => {
      unsubscribeActivity();
      unsubscribeCoordinator();
    };
  }, [active, activityGate, coordinator]);
  const getSnapshot = useCallback(
    () => coordinator.getSnapshot(TEST_TELEMETRY_HZ),
    [coordinator],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
