import type { WidgetInstanceV3 } from "./profile-document";
import type { TelemetrySnapshot } from "./telemetry-snapshot";

export function isWidgetVisibleV3(widget: WidgetInstanceV3, snapshot: TelemetrySnapshot): boolean {
  const rules = widget.behavior.visibleWhen;
  if (!rules) {
    return true;
  }

  if (rules.inPit !== undefined && snapshot.player.inPit !== rules.inPit) {
    return false;
  }

  if (rules.sessionTypes && rules.sessionTypes.length > 0) {
    if (!rules.sessionTypes.includes(snapshot.session.type)) {
      return false;
    }
  }

  return true;
}