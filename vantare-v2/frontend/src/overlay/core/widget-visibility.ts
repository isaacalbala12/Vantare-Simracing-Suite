import type { WidgetInstanceV3 } from "./profile-document";
import type { OverlayRuntimeContext } from "./overlay-runtime-context";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

export function isWidgetVisibleV3(
  widget: WidgetInstanceV3,
  input: OverlayRuntimeContext | TelemetrySnapshot,
): boolean {
  const context = asRuntimeContext(input);
  const rules = widget.behavior.visibleWhen;
  if (!rules) {
    return true;
  }

  if (rules.inPit !== undefined && context.playerInPit !== rules.inPit) {
    return false;
  }

  if (rules.sessionTypes && rules.sessionTypes.length > 0) {
    if (!context.sessionType || !rules.sessionTypes.includes(context.sessionType)) {
      return false;
    }
  }

  return true;
}

// Adaptador transitorio para el inspector reservado a la integración con #936.
// La autoridad final llama esta regla únicamente con OverlayRuntimeContext V2.
function asRuntimeContext(input: OverlayRuntimeContext | TelemetrySnapshot): OverlayRuntimeContext {
  if ("playerPresent" in input) {
    return input;
  }
  return {
    sessionType: input.session.type,
    playerPresent: input.scoring.some((row) => row.isPlayer === true),
    playerInPit: input.player.inPit,
    vehicleCount: input.scoring.length,
  };
}
