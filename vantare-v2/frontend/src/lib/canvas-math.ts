export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const SNAP_PX = 8;

export function snap(value: number, grid = SNAP_PX): number {
  return Math.round(value / grid) * grid;
}

export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, CANVAS_WIDTH - w)),
    y: Math.max(0, Math.min(y, CANVAS_HEIGHT - h)),
  };
}
