import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";

const previewLayouts = new Map<string, WidgetLayoutV3>();

export function studioFrameTestId(widgetId: string): string {
  return `studio-widget-frame-${widgetId}`;
}

export function findStudioFrameElement(widgetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${studioFrameTestId(widgetId)}"]`);
}

export function getStudioFrameLayoutPreview(widgetId: string): WidgetLayoutV3 | undefined {
  return previewLayouts.get(widgetId);
}

export function clearStudioFrameLayoutPreview(widgetId: string): void {
  previewLayouts.delete(widgetId);
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
  frame.style.left = `${layout.x}px`;
  frame.style.top = `${layout.y}px`;
  frame.style.width = `${layout.w}px`;
  frame.style.height = `${layout.h}px`;
}

export function resetStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  clearStudioFrameLayoutPreview(widgetId);
  applyStudioFrameLayoutPreview(widgetId, layout);
}