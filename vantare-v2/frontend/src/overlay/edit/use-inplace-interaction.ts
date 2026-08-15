import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  SessionLayoutType,
  WidgetInstanceV3,
  WidgetLayoutV3,
} from "../core/profile-document";
import {
  DEFAULT_LAYOUT_VIEWPORT,
  type LayoutViewport,
} from "../core/layout-viewport";
import { applyMovePreview, applyResizePreview } from "../../hub/overlay-studio/canvas/useCanvasInteraction";
import {
  clientToLogical,
  type DOMRectLike,
  type Point,
} from "../../hub/overlay-studio/canvas/canvas-geometry";
import type { ResizeHandle } from "../../hub/overlay-studio/canvas/canvas-resize";
import {
  applyInplaceFrameLayoutPreview,
  beginInplaceFramePreview,
  clearInplaceFrameLayoutPreview,
  resetInplaceFrameLayoutPreview,
} from "./inplace-frame-preview";

export type InplaceInteraction =
  | { kind: "idle" }
  | {
      kind: "move";
      widgetId: string;
      pointerId: number;
      pointerOrigin: Point;
      sceneRect: DOMRectLike;
      scale: number;
      start: WidgetLayoutV3;
    }
  | {
      kind: "resize";
      widgetId: string;
      pointerId: number;
      handle: ResizeHandle;
      pointerOrigin: Point;
      sceneRect: DOMRectLike;
      scale: number;
      start: WidgetLayoutV3;
    };

type ActiveInplaceInteraction = Exclude<InplaceInteraction, { kind: "idle" }> & {
  preview: WidgetLayoutV3;
};

type InplaceInteractionRef = { kind: "idle" } | ActiveInplaceInteraction;

export type UseInplaceInteractionInput = {
  widgets: readonly WidgetInstanceV3[];
  session: SessionLayoutType;
  scale: number;
  layoutViewport?: LayoutViewport;
  sceneRef: RefObject<HTMLElement | null>;
  selectedWidgetId: string | null;
  onCommit(widgetId: string, layout: WidgetLayoutV3): void;
  onSelect(widgetId: string): void;
};

export type UseInplaceInteractionResult = {
  isInteractionActive: boolean;
  isWidgetPreviewActive(widgetId: string): boolean;
  resolveLayout(widget: WidgetInstanceV3): WidgetLayoutV3;
  onFramePointerDown(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown(
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ): void;
  onLostPointerCapture(event: PointerEvent): void;
};

function layoutGeometryChanged(start: WidgetLayoutV3, preview: WidgetLayoutV3): boolean {
  return (
    start.x !== preview.x
    || start.y !== preview.y
    || start.w !== preview.w
    || start.h !== preview.h
  );
}

function siblingLayouts(
  widgets: readonly WidgetInstanceV3[],
  excludeWidgetId: string,
): WidgetLayoutV3[] {
  return widgets.filter((widget) => widget.id !== excludeWidgetId).map((widget) => widget.layout);
}

function getSceneRect(sceneRef: RefObject<HTMLElement | null>): DOMRectLike | null {
  const rect = sceneRef.current?.getBoundingClientRect();
  if (!rect) {
    return null;
  }
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function toLogicalPoint(
  clientX: number,
  clientY: number,
  scale: number,
  sceneRect: DOMRectLike | null,
): Point {
  if (!sceneRect) {
    return { x: 0, y: 0 };
  }
  return clientToLogical({ x: clientX, y: clientY }, sceneRect, scale);
}

export function useInplaceInteraction(input: UseInplaceInteractionInput): UseInplaceInteractionResult {
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const interactionRef = useRef<InplaceInteractionRef>({ kind: "idle" });
  const inputRef = useRef({
    ...input,
    layoutViewport: input.layoutViewport ?? DEFAULT_LAYOUT_VIEWPORT,
  });

  useLayoutEffect(() => {
    inputRef.current = {
      ...input,
      layoutViewport: input.layoutViewport ?? DEFAULT_LAYOUT_VIEWPORT,
    };
  }, [input]);

  const setInteraction = useCallback((next: InplaceInteractionRef) => {
    interactionRef.current = next;
    setActiveWidgetId(next.kind === "idle" ? null : next.widgetId);
  }, []);

  const cancelInteraction = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind !== "idle") {
      resetInplaceFrameLayoutPreview(current.widgetId, current.start);
    }
    setInteraction({ kind: "idle" });
  }, [setInteraction]);

  const commitInteraction = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind === "idle") {
      return;
    }
    if (!layoutGeometryChanged(current.start, current.preview)) {
      clearInplaceFrameLayoutPreview(current.widgetId);
      setInteraction({ kind: "idle" });
      return;
    }
    const committed = structuredClone(current.preview);
    clearInplaceFrameLayoutPreview(current.widgetId);
    setInteraction({ kind: "idle" });
    inputRef.current.onCommit(current.widgetId, committed);
  }, [setInteraction]);

  const updatePointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }

    const { widgets } = inputRef.current;
    const widget = widgets.find((entry) => entry.id === current.widgetId);
    if (!widget) {
      cancelInteraction();
      return;
    }

    const pointerCurrent = toLogicalPoint(
      event.clientX,
      event.clientY,
      current.scale,
      current.sceneRect,
    );
    const siblings = siblingLayouts(widgets, current.widgetId);
    const disableSnap = event.altKey;

    if (current.kind === "move") {
      const next = applyMovePreview({
        start: current.start,
        pointerOrigin: current.pointerOrigin,
        pointerCurrent,
        siblings,
        disableSnap,
        layoutViewport: inputRef.current.layoutViewport,
      });
      interactionRef.current = {
        ...current,
        preview: next.layout,
      };
      applyInplaceFrameLayoutPreview(current.widgetId, next.layout);
      return;
    }

    const next = applyResizePreview({
      widget,
      start: current.start,
      handle: current.handle,
      pointerOrigin: current.pointerOrigin,
      pointerCurrent,
      siblings,
      disableSnap,
      layoutViewport: inputRef.current.layoutViewport,
    });
    interactionRef.current = {
      ...current,
      preview: next.layout,
    };
    applyInplaceFrameLayoutPreview(current.widgetId, next.layout);
  }, [cancelInteraction]);

  const endPointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }
    commitInteraction();
  }, [commitInteraction]);

  const onLostPointerCapture = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }
    cancelInteraction();
  }, [cancelInteraction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (interactionRef.current.kind !== "idle") {
        event.preventDefault();
        cancelInteraction();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", updatePointer);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", onLostPointerCapture);
    window.addEventListener("lostpointercapture", onLostPointerCapture);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", onLostPointerCapture);
      window.removeEventListener("lostpointercapture", onLostPointerCapture);
    };
  }, [cancelInteraction, endPointer, onLostPointerCapture, updatePointer]);

  const beginMove = useCallback((widgetId: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    const widget = inputRef.current.widgets.find((entry) => entry.id === widgetId);
    if (!widget) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const sceneRect = getSceneRect(inputRef.current.sceneRef);
    if (!sceneRect) {
      return;
    }

    const scale = inputRef.current.scale;
    const pointerOrigin = toLogicalPoint(
      event.clientX,
      event.clientY,
      scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);
    beginInplaceFramePreview(widgetId, "move", start);
    applyInplaceFrameLayoutPreview(widgetId, start);

    setInteraction({
      kind: "move",
      widgetId,
      pointerId: event.pointerId,
      pointerOrigin,
      sceneRect,
      scale,
      start,
      preview: start,
    });
    inputRef.current.onSelect(widgetId);
  }, [setInteraction]);

  const beginResize = useCallback((
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    const widget = inputRef.current.widgets.find((entry) => entry.id === widgetId);
    if (!widget) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const sceneRect = getSceneRect(inputRef.current.sceneRef);
    if (!sceneRect) {
      return;
    }

    const scale = inputRef.current.scale;
    const pointerOrigin = toLogicalPoint(
      event.clientX,
      event.clientY,
      scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);
    beginInplaceFramePreview(widgetId, "resize", start);
    applyInplaceFrameLayoutPreview(widgetId, start);

    setInteraction({
      kind: "resize",
      widgetId,
      pointerId: event.pointerId,
      handle,
      pointerOrigin,
      sceneRect,
      scale,
      start,
      preview: start,
    });
    inputRef.current.onSelect(widgetId);
  }, [setInteraction]);

  const resolveLayout = useCallback((widget: WidgetInstanceV3): WidgetLayoutV3 => widget.layout, []);

  const isWidgetPreviewActive = useCallback((widgetId: string): boolean => {
    return activeWidgetId !== null && activeWidgetId === widgetId;
  }, [activeWidgetId]);

  return {
    isInteractionActive: activeWidgetId !== null,
    isWidgetPreviewActive,
    resolveLayout,
    onFramePointerDown: beginMove,
    onResizePointerDown: beginResize,
    onLostPointerCapture,
  };
}
