export const HUB_DESIGN_HEIGHT = 1080;
export const HUB_ZOOM_FLOOR = 1;
export const HUB_ZOOM_CEILING = 2.5;

export function resolveHubZoomFactor(windowHeight: number): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) {
    return HUB_ZOOM_FLOOR;
  }
  return Math.min(
    Math.max(windowHeight / HUB_DESIGN_HEIGHT, HUB_ZOOM_FLOOR),
    HUB_ZOOM_CEILING,
  );
}

export function applyHubZoom(host: Pick<HTMLElement, "style">, factor: number): void {
  const zoom = String(factor);
  (host.style as CSSStyleDeclaration & { zoom?: string }).zoom = zoom;
}

export function clearHubZoom(host: Pick<HTMLElement, "style">): void {
  (host.style as CSSStyleDeclaration & { zoom?: string }).zoom = "";
}
