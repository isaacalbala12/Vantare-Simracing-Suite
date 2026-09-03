import type { ReactNode } from "react";
import type { WidgetLayoutV3, WidgetType, WidgetVisualV3 } from "./profile-document";
import {
  resolveWidgetVisualGeometry,
  resolveWidgetVisualGeometryForType,
} from "./widget-visual-geometry";

type VisualLayoutSize = Pick<WidgetLayoutV3, "w" | "h">;
type VisualSelection = Pick<WidgetVisualV3, "systemId" | "baseSettings" | "appearanceOverrides">;

function isFluidRedlineStandings(
  widgetType: WidgetType,
  visual: VisualSelection | undefined,
): boolean {
  if (widgetType !== "standings" || visual?.systemId !== "vantare-endurance") {
    return false;
  }
  const templateId = visual.appearanceOverrides.templateId ?? visual.baseSettings.templateId;
  return templateId === undefined || templateId === "standings-redline";
}

export function WidgetVisualViewport(props: {
  widgetType: WidgetType;
  visual?: VisualSelection;
  layout: VisualLayoutSize;
  visualBaseWidth?: number;
  testId: string;
  children: ReactNode;
}): React.ReactElement {
  const fluidWidth = isFluidRedlineStandings(props.widgetType, props.visual);
  const geometry = fluidWidth
    ? resolveWidgetVisualGeometry(props.layout, props.visualBaseWidth ?? props.layout.w)
    : resolveWidgetVisualGeometryForType(props.layout, props.widgetType);
  return (
    <div
      data-testid={props.testId}
      data-widget-visual-viewport="true"
      data-widget-visual-base-width={geometry.baseWidth}
      data-widget-visual-fluid-width={fluidWidth ? "true" : undefined}
      style={{
        width: geometry.baseWidth,
        height: geometry.baseHeight,
        transform: `scale(${geometry.scale})`,
        transformOrigin: "top left",
      }}
    >
      {props.children}
    </div>
  );
}
