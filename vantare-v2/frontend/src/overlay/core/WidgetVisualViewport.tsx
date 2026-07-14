import type { ReactNode } from "react";
import type { WidgetLayoutV3, WidgetType } from "./profile-document";
import { resolveWidgetVisualGeometryForType } from "./widget-visual-geometry";

type VisualLayoutSize = Pick<WidgetLayoutV3, "w" | "h">;

export function WidgetVisualViewport(props: {
  widgetType: WidgetType;
  layout: VisualLayoutSize;
  testId: string;
  children: ReactNode;
}): React.ReactElement {
  const geometry = resolveWidgetVisualGeometryForType(props.layout, props.widgetType);
  return (
    <div
      data-testid={props.testId}
      data-widget-visual-viewport="true"
      data-widget-visual-base-width={geometry.baseWidth}
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
