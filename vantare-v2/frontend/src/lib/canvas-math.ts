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

export const WIDGET_MIN_SIZE = { w: 80, h: 40 };

export const WIDGET_RATIOS: Record<string, number | null> = {
  standings: null,
  relative: null,
  delta: 4,
  telemetry: 2,
  "telemetry-vertical": 0.5,
  pedals: 2,
};

const PROPORTIONAL_TYPES = new Set(["relative", "standings"]);

export function resizeWithRatio(
  type: string,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
  baseAspect?: number,
  round = true,
): { w: number; h: number } {
  const ratio = WIDGET_RATIOS[type] ?? null;
  const roundFn = round ? Math.round : (v: number) => v;
  if (ratio != null) {
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + deltaY);
    const w = Math.max(WIDGET_MIN_SIZE.w, roundFn(h * ratio));
    return { w, h };
  }
  if (PROPORTIONAL_TYPES.has(type)) {
    const aspect = baseAspect ?? (startH > 0 ? startW / startH : 1);
    const dominant = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const sign = Math.sign(deltaX) !== 0 ? Math.sign(deltaX) : Math.sign(deltaY);
    const h = Math.max(WIDGET_MIN_SIZE.h, startH + sign * dominant);
    const w = Math.max(WIDGET_MIN_SIZE.w, roundFn(h * aspect));
    return { w, h };
  }
  return {
    w: Math.max(WIDGET_MIN_SIZE.w, startW + deltaX),
    h: Math.max(WIDGET_MIN_SIZE.h, startH + deltaY),
  };
}

export function clampSize(
  w: number,
  h: number,
  x: number,
  y: number,
): { w: number; h: number; x: number; y: number } {
  const maxW = CANVAS_WIDTH - x;
  const maxH = CANVAS_HEIGHT - y;
  return {
    w: Math.min(w, maxW),
    h: Math.min(h, maxH),
    x,
    y,
  };
}
