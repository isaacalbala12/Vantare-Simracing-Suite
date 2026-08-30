import type { WidgetInstanceV3 } from "./profile-document";
import type { OverlayRuntimeContext } from "./overlay-runtime-context";

export function isWidgetVisibleV3(
  widget: WidgetInstanceV3,
  context: OverlayRuntimeContext,
): boolean {
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
