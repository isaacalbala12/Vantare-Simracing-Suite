import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
  WidgetInstanceV3,
} from "../core/profile-document";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { isWidgetVisibleV3 } from "../core/widget-visibility";

const EXACT_SESSION_LAYOUT_TYPES = new Set<SessionLayoutType>([
  "practice",
  "qualifying",
  "race",
  "endurance",
]);

export function mapTelemetrySessionToLayoutType(
  sessionType: TelemetrySnapshot["session"]["type"],
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
  snapshot: TelemetrySnapshot,
): SessionLayoutV3 {
  const layoutType = mapTelemetrySessionToLayoutType(snapshot.session.type);
  return document.layouts[layoutType] ?? document.layouts.general;
}

export function selectRuntimeWidgets(
  layout: SessionLayoutV3,
  snapshot: TelemetrySnapshot,
): WidgetInstanceV3[] {
  return [...layout.widgets]
    .filter((widget) => widget.behavior.enabled)
    .filter((widget) => isWidgetVisibleV3(widget, snapshot))
    .sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}