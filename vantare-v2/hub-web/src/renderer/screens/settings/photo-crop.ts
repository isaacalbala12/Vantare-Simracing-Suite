import { pilotEditorLimits } from "../../../contract/generated/contract";
export interface PhotoCrop {
  x: number;
  y: number;
  side: number;
}
export function cropExtent(
  crop: PhotoCrop,
  width: number,
  height: number,
): [number, number] {
  const short = Math.min(width, height);
  return [(crop.side * short) / width, (crop.side * short) / height];
}
export function clampCrop(
  crop: PhotoCrop,
  width: number,
  height: number,
): PhotoCrop {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("invalid dimensions");
  const side = Number.isFinite(crop.side)
    ? Math.max(pilotEditorLimits.cropMinSide, Math.min(1, crop.side))
    : 1;
  const [ew, eh] = cropExtent({ ...crop, side }, width, height);
  return {
    x: Math.max(0, Math.min(1 - ew, Number.isFinite(crop.x) ? crop.x : 0)),
    y: Math.max(0, Math.min(1 - eh, Number.isFinite(crop.y) ? crop.y : 0)),
    side,
  };
}
export function centeredCrop(width: number, height: number): PhotoCrop {
  const [ew, eh] = cropExtent({ x: 0, y: 0, side: 1 }, width, height);
  return clampCrop(
    { x: (1 - ew) / 2, y: (1 - eh) / 2, side: 1 },
    width,
    height,
  );
}
export function moveCrop(
  crop: PhotoCrop,
  dx: number,
  dy: number,
  width: number,
  height: number,
) {
  return clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, width, height);
}
export function zoomCrop(
  crop: PhotoCrop,
  factor: number,
  width: number,
  height: number,
) {
  const [ew, eh] = cropExtent(crop, width, height);
  const cx = crop.x + ew / 2,
    cy = crop.y + eh / 2;
  const result = clampCrop(
    { ...crop, side: crop.side / Math.max(Number.EPSILON, factor) },
    width,
    height,
  );
  const [nw, nh] = cropExtent(result, width, height);
  return clampCrop(
    { ...result, x: cx - nw / 2, y: cy - nh / 2 },
    width,
    height,
  );
}
