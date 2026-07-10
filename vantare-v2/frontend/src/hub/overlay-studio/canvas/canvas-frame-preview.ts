import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";

const previewLayouts = new Map<string, WidgetLayoutV3>();
const frameElements = new Map<string, HTMLElement>();

export function studioFrameTestId(widgetId: string): string {
  return `studio-widget-frame-${widgetId}`;
}

export function registerStudioFrameElement(widgetId: string, element: HTMLElement | null): void {
  if (element) {
    frameElements.set(widgetId, element);
    return;
  }
  frameElements.delete(widgetId);
}

export function findStudioFrameElement(widgetId: string): HTMLElement | null {
  return frameElements.get(widgetId) ?? document.querySelector<HTMLElement>(`[data-testid="${studioFrameTestId(widgetId)}"]`);
}

export function getStudioFrameLayoutPreview(widgetId: string): WidgetLayoutV3 | undefined {
  return previewLayouts.get(widgetId);
}

export function clearStudioFrameLayoutPreview(widgetId: string): void {
  previewLayouts.delete(widgetId);
}

function writeFrameGeometry(frame: HTMLElement, layout: WidgetLayoutV3): void {
  frame.style.left = `${layout.x}px`;
  frame.style.top = `${layout.y}px`;
  frame.style.width = `${layout.w}px`;
  frame.style.height = `${layout.h}px`;
}

export function applyStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  previewLayouts.set(widgetId, layout);
  const frame = findStudioFrameElement(widgetId);
  if (!frame) {
    return;
  }
  writeFrameGeometry(frame, layout);
}

export function resetStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  clearStudioFrameLayoutPreview(widgetId);
  applyStudioFrameLayoutPreview(widgetId, layout);
}

export function resolveStudioFrameGeometry(
  widgetId: string,
  layout: WidgetLayoutV3,
  previewActive: boolean,
): WidgetLayoutV3 {
  if (!previewActive) {
    return layout;
  }
  return getStudioFrameLayoutPreview(widgetId) ?? layout;
}