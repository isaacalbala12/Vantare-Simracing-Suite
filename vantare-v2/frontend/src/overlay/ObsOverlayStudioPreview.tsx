import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  resolveLayoutViewportTransform,
  type LayoutViewport,
  type ViewportSize,
} from "./core/layout-viewport";
import "./obs-overlay-studio-preview.css";

export type ObsOverlayStudioPreviewProps = {
  children: ReactNode;
  layoutViewport: LayoutViewport;
};

export function ObsOverlayStudioPreview({
  children,
  layoutViewport,
}: ObsOverlayStudioPreviewProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [outputViewport, setOutputViewport] = useState<ViewportSize | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateViewport = (width: number, height: number) => {
      const isValid =
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0 &&
        width <= MAX_LAYOUT_VIEWPORT_DIMENSION &&
        height <= MAX_LAYOUT_VIEWPORT_DIMENSION;
      const next = isValid ? { width, height } : null;
      setOutputViewport((current) => {
        if (current === null && next === null) return current;
        if (current && next && current.width === next.width && current.height === next.height) {
          return current;
        }
        return next;
      });
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === stage) ?? entries[0];
        if (!entry) return;
        const contentBoxSize = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize as unknown as ResizeObserverSize | undefined;
        updateViewport(
          contentBoxSize?.inlineSize ?? entry.contentRect.width,
          contentBoxSize?.blockSize ?? entry.contentRect.height,
        );
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    const measureClientBox = () => updateViewport(stage.clientWidth, stage.clientHeight);
    measureClientBox();
    window.addEventListener("resize", measureClientBox);
    return () => window.removeEventListener("resize", measureClientBox);
  }, []);

  const transform = outputViewport
    ? resolveLayoutViewportTransform(layoutViewport, outputViewport)
    : null;
  const sceneStyle: CSSProperties | undefined = transform
    ? {
        width: layoutViewport.width,
        height: layoutViewport.height,
        transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
        transformOrigin: "top left",
      }
    : undefined;

  return (
    <div className="obs-studio-preview" data-testid="obs-studio-preview">
      <div
        ref={stageRef}
        className="obs-studio-preview__stage"
        data-testid="obs-studio-preview-stage"
      >
        {transform && sceneStyle ? (
          <div
            data-testid="obs-studio-preview-scene"
            className="obs-studio-preview__scene obs-studio-preview__scene--grid"
            data-scale={transform.scale}
            data-offset-x={transform.offsetX}
            data-offset-y={transform.offsetY}
            style={sceneStyle}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
