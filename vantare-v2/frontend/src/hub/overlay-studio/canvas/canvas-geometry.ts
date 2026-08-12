import {
  DEFAULT_LAYOUT_VIEWPORT,
  MIN_LAYOUT_VIEWPORT_DIMENSION,
  type LayoutViewport,
} from "../../../overlay/core/layout-viewport";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import type { StudioPreviewState } from "../state/studio-store";

/** @deprecated Prefer the document's resolved layoutViewport. */
export const CANVAS_WIDTH = DEFAULT_LAYOUT_VIEWPORT.width;
/** @deprecated Prefer the document's resolved layoutViewport. */
export const CANVAS_HEIGHT = DEFAULT_LAYOUT_VIEWPORT.height;
export const GRID_SIZE = 8;
export const SNAP_TOLERANCE = 6;
export const MINIMUM_VISIBLE = MIN_LAYOUT_VIEWPORT_DIMENSION;

export type Point = { x: number; y: number };

export type DOMRectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveCanvasScale(input: {
  containerWidth: number;
  containerHeight: number;
  zoom: StudioPreviewState["zoom"];
  layoutViewport?: LayoutViewport;
  allowUpscale?: boolean;
}): number {
  const containerWidth = finiteNumber(input.containerWidth);
  const containerHeight = finiteNumber(input.containerHeight);
  if (containerWidth <= 0 || containerHeight <= 0) {
    return 0;
  }
  if (input.zoom === "fit") {
    const layoutViewport = input.layoutViewport ?? DEFAULT_LAYOUT_VIEWPORT;
    const scaleX = containerWidth / layoutViewport.width;
    const scaleY = containerHeight / layoutViewport.height;
    const fitScale = Math.min(scaleX, scaleY);
    return input.allowUpscale ? fitScale : Math.min(fitScale, 1);
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

export function clampRecoverableLayout(
  layout: WidgetLayoutV3,
  layoutViewport: LayoutViewport,
): WidgetLayoutV3 {
  let x = finiteNumber(layout.x);
  let y = finiteNumber(layout.y);
  const w = Math.max(1, finiteNumber(layout.w, 1));
  const h = Math.max(1, finiteNumber(layout.h, 1));

  if (x + w < MINIMUM_VISIBLE) {
    x = MINIMUM_VISIBLE - w;
  }
  if (x > layoutViewport.width - MINIMUM_VISIBLE) {
    x = layoutViewport.width - MINIMUM_VISIBLE;
  }
  if (y + h < MINIMUM_VISIBLE) {
    y = MINIMUM_VISIBLE - h;
  }
  if (y > layoutViewport.height - MINIMUM_VISIBLE) {
    y = layoutViewport.height - MINIMUM_VISIBLE;
  }

  return {
    ...layout,
    x,
    y,
    w,
    h,
  };
}
