import { defaultZoom, zoomLevels } from "./contract/generated/contract";

/** DIP client area; GPUI ui/lib.rs and gpui_windows/events.rs. */
export function windowZoomLimit(width: number, height: number): number {
  return Math.max(zoomLevels[0], Math.min(width / 1280, height / 720) * 100);
}
export function effectiveZoom(
  requested: number,
  width: number,
  height: number,
) {
  return Math.min(requested, windowZoomLimit(width, height));
}
/** Keep the requested preference when resizing, as GPUI does. */
export function zoomStep(value: number, direction: -1 | 0 | 1, limit: number) {
  if (direction === 0) return defaultZoom;
  if (direction < 0)
    return (
      [...zoomLevels].reverse().find((step) => step < Math.min(value, limit)) ??
      zoomLevels[0]
    );
  return (
    zoomLevels.find((step) => step > value && step <= limit + 0.001) ?? value
  );
}
