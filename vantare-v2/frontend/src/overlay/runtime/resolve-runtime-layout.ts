import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
  WidgetInstanceV3,
} from "../core/profile-document";
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
  context: OverlayRuntimeContext,
): SessionLayoutV3 {
  const layoutType = mapTelemetrySessionToLayoutType(context.sessionType);
  return document.layouts[layoutType] ?? document.layouts.general;
}

export function selectRuntimeWidgets(
  layout: SessionLayoutV3,
  context: OverlayRuntimeContext,
  options: Readonly<{ bypassVisibility?: boolean }> = {},
): WidgetInstanceV3[] {
  return [...layout.widgets]
    .filter((widget) => widget.behavior.enabled)
    .filter((widget) => options.bypassVisibility || isWidgetVisibleV3(widget, context))
    .sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}
