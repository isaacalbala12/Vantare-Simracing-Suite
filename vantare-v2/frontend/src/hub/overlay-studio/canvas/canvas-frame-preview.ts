import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import { resolveWidgetVisualGeometry } from "../../../overlay/core/widget-visual-geometry";
import { resolveMinimumWidthFrameLayout } from "../../../overlay/widget-types/standings/standings-redline-layout";

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

function resolveEffectiveFrameLayout(frame: HTMLElement, layout: WidgetLayoutV3): WidgetLayoutV3 {
  const minimumWidth = Number(frame.dataset.effectiveMinimumWidth);
  const viewportWidth = Number(frame.dataset.layoutViewportWidth);
  return resolveMinimumWidthFrameLayout(
    layout,
    Number.isFinite(minimumWidth) && minimumWidth > 0 ? minimumWidth : undefined,
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : undefined,
  );
}

function writeFrameGeometry(frame: HTMLElement, layout: WidgetLayoutV3): void {
  const effectiveLayout = resolveEffectiveFrameLayout(frame, layout);
  frame.style.left = `${effectiveLayout.x}px`;
  frame.style.top = `${effectiveLayout.y}px`;
  frame.style.width = `${effectiveLayout.w}px`;
  frame.style.height = `${effectiveLayout.h}px`;
  const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
  const baseWidth = viewport?.dataset.widgetVisualFluidWidth === "true"
    ? effectiveLayout.w
    : Number(viewport?.dataset.widgetVisualBaseWidth);
  if (viewport && Number.isFinite(baseWidth) && baseWidth > 0) {
    const geometry = resolveWidgetVisualGeometry(effectiveLayout, baseWidth);
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
  const effectiveStart = resolveEffectiveFrameLayout(frame, start);
  const effectivePreview = resolveEffectiveFrameLayout(frame, preview);
  const dx = effectivePreview.x - effectiveStart.x;
  const dy = effectivePreview.y - effectiveStart.y;
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
