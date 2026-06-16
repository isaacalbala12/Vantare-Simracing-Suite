import type { WidgetConfig } from "./profile";
import { getTelemetryRef, resolveSessionMode } from "./telemetry-ref";

export type TelemetryState = {
  player?: {
    inPit: boolean;
  };
  sessionType: string;
};

/**
 * Evaluate whether a widget should be visible based on its `visibleWhen` rules.
 * Returns `true` when no rules are defined (visible by default).
 */
export function isWidgetVisible(
  widget: WidgetConfig,
  state: TelemetryState,
): boolean {
  if (!widget.visibleWhen) return true;
  const { inPit, sessionType } = widget.visibleWhen;

  if (inPit != null) {
    const playerInPit = state.player?.inPit ?? false;
    if (playerInPit !== inPit) return false;
  }

  if (sessionType != null && sessionType.length > 0) {
    const current = state.sessionType;
    if (!current) return false;
    // Widen to string[] for the runtime check (sessionType literals are a subset of strings)
    const valid = sessionType as unknown as string[];
    if (!valid.includes(current)) return false;
  }

  return true;
}

/**
 * Derive a TelemetryState snapshot from the global telemetry ref.
 */
export function getCurrentTelemetryState(): TelemetryState {
  const ref = getTelemetryRef();
  const playerVehicle = ref.vehicles.find((v) => v.isPlayer);
  return {
    player: {
      inPit: playerVehicle?.inPits ?? false,
    },
    sessionType: resolveSessionMode(ref.sessionType, ref.sessionName),
  };
}
