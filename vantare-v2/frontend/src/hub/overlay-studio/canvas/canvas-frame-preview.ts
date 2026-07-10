import type { CoreWidgetType, WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { resolveWidgetIntrinsicScale } from "./widget-intrinsic-scale";

type FramePreviewKind = "move" | "resize";

type FramePreviewSession = {
  kind: FramePreviewKind;
  start: WidgetLayoutV3;
  preview: WidgetLayoutV3;
  widgetType: CoreWidgetType;
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

export function getStudioFramePreviewKind(widgetId: string): FramePreviewKind | undefined {
  return previewSessions.get(widgetId)?.kind;
}

function findStudioIntrinsicScaler(frame: HTMLElement, widgetId: string): HTMLElement | null {
  return frame.querySelector<HTMLElement>(`[data-testid="studio-widget-intrinsic-scaler-${widgetId}"]`);
}

function writeIntrinsicScalerScale(
  frame: HTMLElement,
  widgetId: string,
  layout: Pick<WidgetLayoutV3, "w" | "h">,
  widgetType: CoreWidgetType,
): void {
  const scaler = findStudioIntrinsicScaler(frame, widgetId);
  if (!scaler) {
    return;
  }
  const intrinsic = resolveWidgetIntrinsicScale(layout, widgetType);
  scaler.style.transform = `scale(${intrinsic.scale})`;
}

function clearIntrinsicScalerOverride(frame: HTMLElement, widgetId: string): void {
  const scaler = findStudioIntrinsicScaler(frame, widgetId);
  if (scaler) {
    scaler.style.transform = "";
  }
}

export function clearStudioFrameLayoutPreview(widgetId: string): void {
  const frame = findStudioFrameElement(widgetId);
  if (frame) {
    frame.style.transform = "";
    clearIntrinsicScalerOverride(frame, widgetId);
  }
  previewSessions.delete(widgetId);
}

function writeFrameGeometry(frame: HTMLElement, layout: WidgetLayoutV3): void {
  frame.style.left = `${layout.x}px`;
  frame.style.top = `${layout.y}px`;
  frame.style.width = `${layout.w}px`;
  frame.style.height = `${layout.h}px`;
}

function writeMovePreview(frame: HTMLElement, start: WidgetLayoutV3, preview: WidgetLayoutV3): void {
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
  widgetType: CoreWidgetType,
): void {
  previewSessions.set(widgetId, {
    kind,
    start: structuredClone(start),
    preview: structuredClone(start),
    widgetType,
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
  writeIntrinsicScalerScale(frame, widgetId, session.preview, session.widgetType);
}

export function resetStudioFrameLayoutPreview(
  widgetId: string,
  layout: WidgetLayoutV3,
): void {
  const frame = findStudioFrameElement(widgetId);
  if (frame) {
    frame.style.transform = "";
    writeFrameGeometry(frame, layout);
    clearIntrinsicScalerOverride(frame, widgetId);
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

/** Visual layout after imperative preview (move uses transform delta). */
export function resolveStudioFrameVisualGeometry(
  widgetId: string,
  layout: WidgetLayoutV3,
): WidgetLayoutV3 {
  const session = previewSessions.get(widgetId);
  if (!session) {
    return layout;
  }
  return session.preview;
}