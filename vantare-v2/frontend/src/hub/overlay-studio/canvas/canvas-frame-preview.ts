import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { resolveWidgetVisualGeometry } from "../../../overlay/core/widget-visual-geometry";

type FramePreviewKind = "move" | "resize";

type FramePreviewSession = {
  kind: FramePreviewKind;
  start: WidgetLayoutV3;
  preview: WidgetLayoutV3;
};

const previewSessions = new Map<string, FramePreviewSession>();
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
  return previewSessions.get(widgetId)?.preview;
}

export function clearStudioFrameLayoutPreview(widgetId: string): void {
  const frame = findStudioFrameElement(widgetId);
  if (frame) {
    frame.style.transform = "";
  }
  previewSessions.delete(widgetId);
}

function writeFrameGeometry(frame: HTMLElement, layout: WidgetLayoutV3): void {
  frame.style.left = `${layout.x}px`;
  frame.style.top = `${layout.y}px`;
  frame.style.width = `${layout.w}px`;
  frame.style.height = `${layout.h}px`;
  const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
  const baseWidth = Number(viewport?.dataset.widgetVisualBaseWidth);
  if (viewport && Number.isFinite(baseWidth) && baseWidth > 0) {
    const geometry = resolveWidgetVisualGeometry(layout, baseWidth);
    viewport.style.width = `${geometry.baseWidth}px`;
    viewport.style.height = `${geometry.baseHeight}px`;
    viewport.style.transform = `scale(${geometry.scale})`;
  }
}

function writeMovePreview(
  frame: HTMLElement,
  start: WidgetLayoutV3,
  preview: WidgetLayoutV3,
): void {
  writeFrameGeometry(frame, start);
  const dx = preview.x - start.x;
  const dy = preview.y - start.y;
  if (dx === 0 && dy === 0) {
    frame.style.transform = "";
    return;
  }
  frame.style.transform = `translate(${dx}px, ${dy}px)`;
}

export function beginStudioFramePreview(
  widgetId: string,
  kind: FramePreviewKind,
  start: WidgetLayoutV3,
): void {
  previewSessions.set(widgetId, {
    kind,
    start: structuredClone(start),
    preview: structuredClone(start),
  });
}

export function applyStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  const session = previewSessions.get(widgetId);
  if (!session) {
    return;
  }

  session.preview = structuredClone(layout);

  const frame = findStudioFrameElement(widgetId);
  if (!frame) {
    return;
  }

  if (session.kind === "move") {
    writeMovePreview(frame, session.start, session.preview);
    return;
  }

  frame.style.transform = "";
  writeFrameGeometry(frame, session.preview);
}

export function resetStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  const session = previewSessions.get(widgetId);
  if (session) {
    session.preview = structuredClone(layout);
  }
  const frame = findStudioFrameElement(widgetId);
  if (frame) {
    frame.style.transform = "";
    writeFrameGeometry(frame, layout);
  }
  clearStudioFrameLayoutPreview(widgetId);
}

export function resolveStudioFrameGeometry(
  widgetId: string,
  layout: WidgetLayoutV3,
  previewActive: boolean,
): WidgetLayoutV3 {
  if (!previewActive) {
    return layout;
  }

  const session = previewSessions.get(widgetId);
  if (!session) {
    return layout;
  }

  if (session.kind === "move") {
    return session.start;
  }

  return session.preview;
}
