import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  resolveCanvasScale,
} from "../hub/overlay-studio/canvas/canvas-geometry";
import "./obs-overlay-studio-preview.css";

export type ObsOverlayStudioPreviewProps = {
  children: ReactNode;
};

export function ObsOverlayStudioPreview({ children }: ObsOverlayStudioPreviewProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = stageRef.current;
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
    zoom: "fit",
  });
  const displayWidth = Math.round(CANVAS_WIDTH * scale);
  const displayHeight = Math.round(CANVAS_HEIGHT * scale);

  return (
    <div className="obs-studio-preview" data-testid="obs-studio-preview">
      <div ref={stageRef} className="obs-studio-preview__stage">
        <div
          className="obs-studio-preview__scene-shell"
          style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
        >
          <div
            data-testid="obs-studio-preview-scene"
            className="obs-studio-preview__scene obs-studio-preview__scene--grid"
            data-scale={String(scale)}
            style={{
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}