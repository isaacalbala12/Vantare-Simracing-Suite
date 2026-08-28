import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
  WidgetInstanceV3,
} from "../core/profile-document";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type { OverlayRuntimeContext } from "../core/overlay-runtime-context";
import { isWidgetVisibleV3 } from "../core/widget-visibility";

const EXACT_SESSION_LAYOUT_TYPES = new Set<SessionLayoutType>([
  "practice",
  "qualifying",
  "race",
  "endurance",
]);

export function mapTelemetrySessionToLayoutType(
  sessionType: OverlayRuntimeContext["sessionType"],
): SessionLayoutType {
  if (sessionType === "warmup") {
    return "general";
  }
  if (EXACT_SESSION_LAYOUT_TYPES.has(sessionType as SessionLayoutType)) {
    return sessionType as SessionLayoutType;
  }
  return "general";
}

export function resolveRuntimeLayout(
  document: ProfileDocumentV3,
  input: OverlayRuntimeContext | TelemetrySnapshot,
): SessionLayoutV3 {
  const context = asRuntimeContext(input);
  const layoutType = mapTelemetrySessionToLayoutType(context.sessionType);
  return document.layouts[layoutType] ?? document.layouts.general;
}

export function selectRuntimeWidgets(
  layout: SessionLayoutV3,
  input: OverlayRuntimeContext | TelemetrySnapshot,
): WidgetInstanceV3[] {
  const context = asRuntimeContext(input);
  return [...layout.widgets]
    .filter((widget) => widget.behavior.enabled)
    .filter((widget) => isWidgetVisibleV3(widget, context))
    .sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

// Adaptador transitorio para mantener compilable la surface reservada a #936.
// Se elimina al cablear OverlayRuntimeContext desde V2 en el hito de integración.
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
