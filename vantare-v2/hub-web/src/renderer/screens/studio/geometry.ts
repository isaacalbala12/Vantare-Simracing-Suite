import { studioGeometryLimits as limits } from "../../../contract/generated/studio";

export type Pair = readonly [number, number];
export type Rect = readonly [number, number, number, number];
const finite = (p: Pair) => p.every(Number.isFinite);
const positive = (p: Pair) => finite(p) && p.every((v) => v > 0);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const validRects = (items: readonly Rect[]) =>
  items.every((r) => finite([r[0], r[1]]) && positive([r[2], r[3]]));

/** Same strict threshold and tie order as hub-host/studio/geometry.rs. */
export function snap(
  center: Pair,
  size: Pair,
  canvas: Pair,
  others: readonly Rect[],
  threshold: number,
) {
  if (
    !finite(center) ||
    !positive(size) ||
    !positive(canvas) ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    !validRects(others)
  )
    return null;
  const margin = canvas[0] * 0.02;
  const axis = (
    pointer: number,
    length: number,
    total: number,
    targets: number[],
  ): [number, number | null] => {
    const start = clamp(pointer - length / 2, 0, Math.max(0, total - length));
    let best: [number, number] | undefined;
    for (const target of targets)
      for (const offset of [0, length / 2, length]) {
        const delta = target - (start + offset);
        if (
          Math.abs(delta) < threshold &&
          (!best || Math.abs(delta) < Math.abs(best[0]))
        )
          best = [delta, target];
      }
    return best ? [start + best[0], best[1]] : [start, null];
  };
  const xs = [canvas[0] / 2, margin, canvas[0] - margin],
    ys = [canvas[1] / 2, margin, canvas[1] - margin];
  for (const [x, y, w, h] of others) {
    xs.push(x, x + w, x + w / 2);
    ys.push(y, y + h, y + h / 2);
  }
  const [x, gx] = axis(center[0], size[0], canvas[0], xs),
    [y, gy] = axis(center[1], size[1], canvas[1], ys);
  return { position: [x, y] as Pair, guides: [gx, gy] as const };
}
export function boundedSize(
  previous: Pair,
  requested: Pair,
  locked: boolean,
  horizontal: boolean,
): Pair | null {
  if (!positive(previous) || !finite(requested)) return null;
  const [minW, minH] = limits.minSize,
    [maxW, maxH] = limits.maxSize;
  if (!locked)
    return [clamp(requested[0], minW, maxW), clamp(requested[1], minH, maxH)];
  const aspect = previous[0] / previous[1];
  const byWidth =
    horizontal ||
    Math.abs((requested[0] - previous[0]) / previous[0]) >=
      Math.abs((requested[1] - previous[1]) / previous[1]);
  const minimum = Math.max(minW, minH * aspect),
    maximum = Math.min(maxW, maxH * aspect);
  if (!Number.isFinite(aspect) || minimum > maximum) return null;
  const width = clamp(
    byWidth ? requested[0] : requested[1] * aspect,
    minimum,
    maximum,
  );
  return [width, width / aspect];
}
export function resize(
  start: Pair,
  size: Pair,
  handle: Pair,
  delta: Pair,
  locked: boolean,
): readonly [Pair, Pair] | null {
  if (
    !finite(start) ||
    !positive(size) ||
    !finite(delta) ||
    !handle.every((v) => Number.isInteger(v) && Math.abs(v) <= 1) ||
    handle.every((v) => v === 0)
  )
    return null;
  const next = boundedSize(
    size,
    [size[0] + delta[0] * handle[0], size[1] + delta[1] * handle[1]],
    locked,
    handle[1] === 0,
  );
  if (!next) return null;
  const position: Pair = [
    start[0] + (handle[0] < 0 ? size[0] - next[0] : 0),
    start[1] + (handle[1] < 0 ? size[1] - next[1] : 0),
  ];
  return finite(position) ? [position, next] : null;
}
export function anchor(
  size: Pair,
  canvas: Pair,
  column: number,
  row: number,
): Pair | null {
  if (
    !positive(size) ||
    !positive(canvas) ||
    ![column, row].every((v) => Number.isInteger(v) && v >= 0 && v <= 2)
  )
    return null;
  return [
    ((canvas[0] - size[0]) * column) / 2,
    ((canvas[1] - size[1]) * row) / 2,
  ];
}
export function nudge(
  position: Pair,
  direction: Pair,
  shift: boolean,
): Pair | null {
  if (
    !finite(position) ||
    !direction.every((v) => Number.isInteger(v) && Math.abs(v) <= 1)
  )
    return null;
  const step = shift ? 8 : 1;
  return [
    clamp(
      position[0] + direction[0] * step,
      -limits.nudgeLimit,
      limits.nudgeLimit,
    ),
    clamp(
      position[1] + direction[1] * step,
      -limits.nudgeLimit,
      limits.nudgeLimit,
    ),
  ];
}
export function heldNudgeDistance(elapsedMs: number, shift: boolean) {
  const ticks = Math.floor(Math.max(0, elapsedMs - 300) / 30);
  const pixels =
    1 +
    Math.min(ticks, 20) +
    Math.min(Math.max(0, ticks - 20), 30) * 4 +
    Math.max(0, ticks - 50) * 8;
  return Math.min(pixels, limits.nudgeLimit) * (shift ? 8 : 1);
}
export function fitCanvas(viewport: Pair, canvas: Pair) {
  if (!positive(viewport) || !positive(canvas)) return null;
  const scale = Math.min(viewport[0] / canvas[0], viewport[1] / canvas[1]);
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}
export function previewOrigin(
  viewport: Pair,
  canvas: Pair,
  scale: number,
): Pair | null {
  if (
    !positive(viewport) ||
    !positive(canvas) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !finite([canvas[0] * scale, canvas[1] * scale])
  )
    return null;
  return [
    Math.max(0, (viewport[0] - canvas[0] * scale) / 2),
    Math.max(0, (viewport[1] - canvas[1] * scale) / 2),
  ];
}
export function freeSpot(
  canvas: Pair,
  size: Pair,
  taken: readonly Rect[],
): Pair | null {
  if (
    !positive(canvas) ||
    !positive(size) ||
    !canvas.every((v) => v >= limits.canvasMin && v <= limits.canvasMax) ||
    !validRects(taken)
  )
    return null;
  const margin = canvas[0] * 0.02,
    step = canvas[0] * 0.01,
    gap = 12;
  for (let y = margin; y + size[1] <= canvas[1] - margin; y += step)
    for (let x = margin; x + size[0] <= canvas[0] - margin; x += step) {
      if (
        !taken.some(
          ([rx, ry, rw, rh]) =>
            x < rx + rw + gap &&
            x + size[0] + gap > rx &&
            y < ry + rh + gap &&
            y + size[1] + gap > ry,
        )
      )
        return [x, y];
    }
  return [
    Math.max(0, canvas[0] - size[0]) / 2,
    Math.max(0, canvas[1] - size[1]) / 2,
  ];
}
