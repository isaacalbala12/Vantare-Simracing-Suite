import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { useStudioDocument, useStudioPreview } from "../state/studio-store";
import { CANVAS_HEIGHT, CANVAS_WIDTH, resolveCanvasScale } from "./canvas-geometry";
import type { SnapGuide } from "./canvas-snap";
import { CanvasGuides } from "./CanvasGuides";
import { StudioWidgetFrame } from "./StudioWidgetFrame";
import { useStudioTelemetrySnapshot } from "./StudioTelemetryProvider";

export type StudioCanvasProps = {
  guides?: readonly SnapGuide[];
};

function sortWidgetsByZIndex(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

export function StudioCanvas({ guides = [] }: StudioCanvasProps): React.ReactElement {
  const { activeLayout, selectedWidgetId, selectWidget } = useStudioDocument();
  const { preview } = useStudioPreview();
  const snapshot = useStudioTelemetrySnapshot();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      setContainerSize({
        width: node.clientWidth || CANVAS_WIDTH,
        height: node.clientHeight || CANVAS_HEIGHT,
      });
    };
    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = resolveCanvasScale({
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    zoom: preview.zoom,
  });

  const widgets = useMemo(
    () => sortWidgetsByZIndex(activeLayout?.widgets ?? []),
    [activeLayout?.widgets],
  );

  return (
    <div
      ref={viewportRef}
      data-testid="studio-canvas-viewport"
      className="osv3-canvas-viewport"
      data-selected-widget-id={selectedWidgetId ?? ""}
      onPointerDown={() => selectWidget(null)}
    >
      <div
        data-testid="studio-canvas-scene"
        className="osv3-canvas-scene"
        data-scale={String(scale)}
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <CanvasGuides guides={guides} />
        {widgets.map((widget) => (
          <StudioWidgetFrame
            key={widget.id}
            widget={widget}
            selected={selectedWidgetId === widget.id}
            snapshot={snapshot}
            onSelect={selectWidget}
          />
        ))}
      </div>
    </div>
  );
}