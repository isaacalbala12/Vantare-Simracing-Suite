export const MIN_LAYOUT_VIEWPORT_DIMENSION = 1;
export const MAX_LAYOUT_VIEWPORT_DIMENSION = 16_384;

export type LayoutViewport = {
  width: number;
  height: number;
};

export type LayoutViewportTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type LayoutPoint = {
  x: number;
  y: number;
};

export const DEFAULT_LAYOUT_VIEWPORT: Readonly<LayoutViewport> = Object.freeze({
  width: 1920,
  height: 1080,
});

export function isValidLayoutViewportDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_LAYOUT_VIEWPORT_DIMENSION &&
    value <= MAX_LAYOUT_VIEWPORT_DIMENSION
  );
}

export function resolveLayoutViewport(document: { layoutViewport?: LayoutViewport }): LayoutViewport {
  const viewport = document.layoutViewport ?? DEFAULT_LAYOUT_VIEWPORT;
  return { width: viewport.width, height: viewport.height };
}

export function resolveLayoutViewportTransform(
  layoutViewport: LayoutViewport,
  outputViewport: LayoutViewport,
): LayoutViewportTransform {
  const scale = Math.min(
    outputViewport.width / layoutViewport.width,
    outputViewport.height / layoutViewport.height,
  );
  return {
    scale,
    offsetX: (outputViewport.width - layoutViewport.width * scale) / 2,
    offsetY: (outputViewport.height - layoutViewport.height * scale) / 2,
  };
}

export function mapLayoutPointToOutput(
  point: LayoutPoint,
  transform: LayoutViewportTransform,
): LayoutPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function mapOutputPointToLayout(
  point: LayoutPoint,
  transform: LayoutViewportTransform,
): LayoutPoint {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}
