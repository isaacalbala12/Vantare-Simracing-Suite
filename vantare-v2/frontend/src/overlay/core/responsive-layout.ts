import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  MIN_LAYOUT_VIEWPORT_DIMENSION,
  type LayoutViewport,
  type ViewportSize,
} from "./layout-viewport";

export const MAX_FRAME_ASPECT = 21 / 9;

export type ResponsiveSceneTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  designWidth: number;
  layoutWidth: number;
  layoutHeight: number;
};

export type WidgetFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function resolveResponsiveSceneTransform(
  layoutViewport: LayoutViewport,
  outputViewport: ViewportSize,
): ResponsiveSceneTransform {
  assertValidDimensions("layoutViewport", layoutViewport.width, layoutViewport.height);
  assertValidDimensions("outputViewport", outputViewport.width, outputViewport.height);

  const scale = outputViewport.height / layoutViewport.height;
  const frameWidth = Math.min(outputViewport.width, outputViewport.height * MAX_FRAME_ASPECT);
  const layoutWidth = frameWidth / scale;

  return {
    scale,
    offsetX: (outputViewport.width - frameWidth) / 2,
    offsetY: (outputViewport.height - layoutViewport.height * scale) / 2,
    designWidth: layoutViewport.width,
    layoutWidth,
    layoutHeight: layoutViewport.height,
  };
}

export function mapWidgetFrameToResponsive(
  frame: WidgetFrame,
  transform: ResponsiveSceneTransform,
): WidgetFrame {
  const repartition = transform.layoutWidth / transform.designWidth;

  if (frame.w >= transform.designWidth) {
    return { x: 0, y: frame.y, w: transform.layoutWidth, h: frame.h };
  }

  const touchesRightEdge = frame.x + frame.w >= transform.designWidth;
  if (touchesRightEdge) {
    return { x: transform.layoutWidth - frame.w, y: frame.y, w: frame.w, h: frame.h };
  }

  return { x: frame.x * repartition, y: frame.y, w: frame.w, h: frame.h };
}

function assertValidDimensions(label: string, width: number, height: number): void {
  const validDimension = (value: number) =>
    Number.isFinite(value) &&
    value >= MIN_LAYOUT_VIEWPORT_DIMENSION &&
    value <= MAX_LAYOUT_VIEWPORT_DIMENSION;
  if (!validDimension(width) || !validDimension(height)) {
    throw new RangeError(
      `${label} dimensions must be finite integers between ${MIN_LAYOUT_VIEWPORT_DIMENSION} and ${MAX_LAYOUT_VIEWPORT_DIMENSION}`,
    );
  }
}
