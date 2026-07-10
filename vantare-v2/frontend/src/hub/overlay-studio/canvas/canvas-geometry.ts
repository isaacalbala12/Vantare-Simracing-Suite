import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import type { StudioPreviewState } from "../state/studio-store";

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const GRID_SIZE = 8;
export const SNAP_TOLERANCE = 6;
export const MINIMUM_VISIBLE = 32;

export type Point = { x: number; y: number };

export type DOMRectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveCanvasScale(input: {
  containerWidth: number;
  containerHeight: number;
  zoom: StudioPreviewState["zoom"];
}): number {
  const containerWidth = finiteNumber(input.containerWidth);
  const containerHeight = finiteNumber(input.containerHeight);
  if (containerWidth <= 0 || containerHeight <= 0) {
    return 0;
  }
  if (input.zoom === "fit") {
    const scaleX = containerWidth / CANVAS_WIDTH;
    const scaleY = containerHeight / CANVAS_HEIGHT;
    return Math.min(scaleX, scaleY, 1);
  }
  return input.zoom / 100;
}

export function clientToLogical(point: Point, canvasRect: DOMRectLike, scale: number): Point {
  const safeScale = scale > 0 ? scale : 1;
  return {
    x: (finiteNumber(point.x) - finiteNumber(canvasRect.left)) / safeScale,
    y: (finiteNumber(point.y) - finiteNumber(canvasRect.top)) / safeScale,
  };
}

export function snapToGrid(value: number, grid = GRID_SIZE): number {
  const safeValue = finiteNumber(value);
  return Math.round(safeValue / grid) * grid;
}

export function clampRecoverableLayout(layout: WidgetLayoutV3): WidgetLayoutV3 {
  let x = finiteNumber(layout.x);
  let y = finiteNumber(layout.y);
  let w = Math.max(1, finiteNumber(layout.w, 1));
  let h = Math.max(1, finiteNumber(layout.h, 1));

  if (x + w < MINIMUM_VISIBLE) {
    x = MINIMUM_VISIBLE - w;
  }
  if (x > CANVAS_WIDTH - MINIMUM_VISIBLE) {
    x = CANVAS_WIDTH - MINIMUM_VISIBLE;
  }
  if (y + h < MINIMUM_VISIBLE) {
    y = MINIMUM_VISIBLE - h;
  }
  if (y > CANVAS_HEIGHT - MINIMUM_VISIBLE) {
    y = CANVAS_HEIGHT - MINIMUM_VISIBLE;
  }

  return {
    ...layout,
    x,
    y,
    w,
    h,
  };
}