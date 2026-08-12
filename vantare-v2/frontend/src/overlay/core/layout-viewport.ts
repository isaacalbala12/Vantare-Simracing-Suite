export const MIN_LAYOUT_VIEWPORT_DIMENSION = 32;
export const MAX_LAYOUT_VIEWPORT_DIMENSION = 16_384;

export type ViewportSize = {
  width: number;
  height: number;
};

export type LayoutViewport = ViewportSize;

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
  outputViewport: ViewportSize,
): LayoutViewportTransform {
  assertValidLayoutViewport(layoutViewport);
  assertValidOutputViewport(outputViewport);
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

function assertValidLayoutViewport(viewport: LayoutViewport): void {
  if (!isValidLayoutViewportDimension(viewport.width) || !isValidLayoutViewportDimension(viewport.height)) {
    throw new RangeError(
      `layoutViewport dimensions must be integers between ${MIN_LAYOUT_VIEWPORT_DIMENSION} and ${MAX_LAYOUT_VIEWPORT_DIMENSION}`,
    );
  }
}

function assertValidOutputViewport(viewport: ViewportSize): void {
  const validDimension = (value: number) =>
    Number.isFinite(value) && value > 0 && value <= MAX_LAYOUT_VIEWPORT_DIMENSION;
  if (!validDimension(viewport.width) || !validDimension(viewport.height)) {
    throw new RangeError(
      `outputViewport dimensions must be finite, greater than 0 and at most ${MAX_LAYOUT_VIEWPORT_DIMENSION}`,
    );
  }
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
  if (!Number.isFinite(transform.scale) || transform.scale <= 0) {
    throw new RangeError("transform.scale must be finite and greater than 0");
  }
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}
