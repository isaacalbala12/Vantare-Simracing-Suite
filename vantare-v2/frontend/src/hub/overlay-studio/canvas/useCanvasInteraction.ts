import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  SessionLayoutType,
  WidgetInstanceV3,
  WidgetLayoutV3,
} from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import type { StudioCommand } from "../state/studio-command";
import {
  applyStudioFrameLayoutPreview,
  beginStudioFramePreview,
  clearStudioFrameLayoutPreview,
  resetStudioFrameLayoutPreview,
} from "./canvas-frame-preview";
import {
  clampRecoverableLayout,
  clientToLogical,
  type DOMRectLike,
  type Point,
} from "./canvas-geometry";
import { resizeWidgetLayout, type ResizeHandle } from "./canvas-resize";
import { snapWidgetLayout, type SnapGuide } from "./canvas-snap";

export type CanvasInteraction =
  | { kind: "idle" }
  | {
      kind: "move";
      widgetId: string;
      pointerId: number;
      pointerOrigin: Point;
      sceneRect: DOMRectLike;
      scale: number;
      start: WidgetLayoutV3;
      guides: SnapGuide[];
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
      guides: SnapGuide[];
    };

type ActiveCanvasInteraction = Exclude<CanvasInteraction, { kind: "idle" }> & {
  preview: WidgetLayoutV3;
};

type CanvasInteractionRef = { kind: "idle" } | ActiveCanvasInteraction;

export type UseCanvasInteractionInput = {
  widgets: readonly WidgetInstanceV3[];
  session: SessionLayoutType;
  scale: number;
  sceneRef: RefObject<HTMLElement | null>;
  selectedWidgetId: string | null;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
};

export type UseCanvasInteractionResult = {
  interaction: CanvasInteraction;
  guides: SnapGuide[];
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

function buildLayoutPatch(start: WidgetLayoutV3, preview: WidgetLayoutV3): Partial<WidgetLayoutV3> {
  const patch: Partial<WidgetLayoutV3> = {};
  if (start.x !== preview.x) {
    patch.x = preview.x;
  }
  if (start.y !== preview.y) {
    patch.y = preview.y;
  }
  if (start.w !== preview.w) {
    patch.w = preview.w;
  }
  if (start.h !== preview.h) {
    patch.h = preview.h;
  }
  return patch;
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
  sceneRef: RefObject<HTMLElement | null>,
  scale: number,
  sceneRect?: DOMRectLike | null,
): Point {
  const rect = sceneRect ?? getSceneRect(sceneRef);
  if (!rect) {
    return { x: 0, y: 0 };
  }
  return clientToLogical({ x: clientX, y: clientY }, rect, scale);
}

function toPublicInteraction(current: CanvasInteractionRef): CanvasInteraction {
  if (current.kind === "idle") {
    return current;
  }
  const { preview: _preview, ...interaction } = current;
  return interaction;
}

export function applyMovePreview(input: {
  start: WidgetLayoutV3;
  pointerOrigin: Point;
  pointerCurrent: Point;
  siblings: readonly WidgetLayoutV3[];
  disableSnap: boolean;
}): { layout: WidgetLayoutV3; guides: SnapGuide[] } {
  const dx = input.pointerCurrent.x - input.pointerOrigin.x;
  const dy = input.pointerCurrent.y - input.pointerOrigin.y;
  const draft = clampRecoverableLayout({
    ...input.start,
    x: input.start.x + dx,
    y: input.start.y + dy,
  });
  const snapped = snapWidgetLayout({
    layout: draft,
    siblings: input.siblings,
    disableSnap: input.disableSnap,
  });
  return { layout: snapped.layout, guides: snapped.guides };
}

export function applyResizePreview(input: {
  widget: WidgetInstanceV3;
  start: WidgetLayoutV3;
  handle: ResizeHandle;
  pointerOrigin: Point;
  pointerCurrent: Point;
  siblings: readonly WidgetLayoutV3[];
  disableSnap: boolean;
}): { layout: WidgetLayoutV3; guides: SnapGuide[] } {
  const definition = widgetTypeRegistry.get(input.widget.type);
  const resized = resizeWidgetLayout({
    startLayout: input.start,
    handle: input.handle,
    pointerDelta: {
      dx: input.pointerCurrent.x - input.pointerOrigin.x,
      dy: input.pointerCurrent.y - input.pointerOrigin.y,
    },
    minSize: definition.capabilities.minimumSize,
    supportsAspectUnlock: definition.capabilities.supportsAspectUnlock,
  });
  const snapped = snapWidgetLayout({
    layout: clampRecoverableLayout(resized),
    siblings: input.siblings,
    disableSnap: input.disableSnap,
  });
  return { layout: snapped.layout, guides: snapped.guides };
}

export function useCanvasInteraction(input: UseCanvasInteractionInput): UseCanvasInteractionResult {
  const [interaction, setInteraction] = useState<CanvasInteraction>({ kind: "idle" });
  const interactionRef = useRef<CanvasInteractionRef>({ kind: "idle" });
  const guidesFrameRef = useRef<number | null>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const flushGuidesFrame = useCallback(() => {
    if (guidesFrameRef.current !== null) {
      cancelAnimationFrame(guidesFrameRef.current);
      guidesFrameRef.current = null;
    }
  }, []);

  const setInteractionState = useCallback((next: CanvasInteractionRef) => {
    interactionRef.current = next;
    setInteraction(toPublicInteraction(next));
  }, []);

  const scheduleGuidesUpdate = useCallback((guides: SnapGuide[]) => {
    const current = interactionRef.current;
    if (current.kind === "idle") {
      return;
    }

    interactionRef.current = { ...current, guides };

    if (guidesFrameRef.current !== null) {
      return;
    }

    guidesFrameRef.current = requestAnimationFrame(() => {
      guidesFrameRef.current = null;
      const latest = interactionRef.current;
      if (latest.kind === "idle") {
        return;
      }
      setInteraction(toPublicInteraction(latest));
    });
  }, []);

  useEffect(() => () => flushGuidesFrame(), [flushGuidesFrame]);

  const cancelInteraction = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind !== "idle") {
      resetStudioFrameLayoutPreview(current.widgetId, current.start);
    }
    flushGuidesFrame();
    setInteractionState({ kind: "idle" });
  }, [flushGuidesFrame, setInteractionState]);

  const commitInteraction = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind === "idle") {
      return;
    }
    if (!layoutGeometryChanged(current.start, current.preview)) {
      clearStudioFrameLayoutPreview(current.widgetId);
      flushGuidesFrame();
      setInteractionState({ kind: "idle" });
      return;
    }
    const patch = buildLayoutPatch(current.start, current.preview);
    inputRef.current.dispatch({
      type: "widget/layout",
      session: inputRef.current.session,
      widgetIds: [current.widgetId],
      patch,
    });
    clearStudioFrameLayoutPreview(current.widgetId);
    flushGuidesFrame();
    setInteractionState({ kind: "idle" });
  }, [flushGuidesFrame, setInteractionState]);

  const updatePointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }

    const { widgets, sceneRef } = inputRef.current;
    const widget = widgets.find((entry) => entry.id === current.widgetId);
    if (!widget) {
      cancelInteraction();
      return;
    }

    const pointerCurrent = toLogicalPoint(
      event.clientX,
      event.clientY,
      sceneRef,
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
      });
      interactionRef.current = {
        ...current,
        preview: next.layout,
        guides: next.guides,
      };
      applyStudioFrameLayoutPreview(current.widgetId, next.layout);
      scheduleGuidesUpdate(next.guides);
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
    });
    interactionRef.current = {
      ...current,
      preview: next.layout,
      guides: next.guides,
    };
    applyStudioFrameLayoutPreview(current.widgetId, next.layout);
    scheduleGuidesUpdate(next.guides);
  }, [cancelInteraction, scheduleGuidesUpdate]);

  const endPointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }
    flushGuidesFrame();
    commitInteraction();
  }, [commitInteraction, flushGuidesFrame]);

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
      inputRef.current.sceneRef,
      scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);
    beginStudioFramePreview(widgetId, "move", start, widget.type);
    applyStudioFrameLayoutPreview(widgetId, start);

    setInteractionState({
      kind: "move",
      widgetId,
      pointerId: event.pointerId,
      pointerOrigin,
      sceneRect,
      scale,
      start,
      preview: start,
      guides: [],
    });
    inputRef.current.selectWidget(widgetId);
  }, [setInteractionState]);

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
      inputRef.current.sceneRef,
      scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);
    beginStudioFramePreview(widgetId, "resize", start, widget.type);
    applyStudioFrameLayoutPreview(widgetId, start);

    setInteractionState({
      kind: "resize",
      widgetId,
      pointerId: event.pointerId,
      handle,
      pointerOrigin,
      sceneRect,
      scale,
      start,
      preview: start,
      guides: [],
    });
    inputRef.current.selectWidget(widgetId);
  }, [setInteractionState]);

  const resolveLayout = useCallback((widget: WidgetInstanceV3): WidgetLayoutV3 => widget.layout, []);

  const isWidgetPreviewActive = useCallback((widgetId: string): boolean => {
    const current = interactionRef.current;
    return current.kind !== "idle" && current.widgetId === widgetId;
  }, []);

  const guides = interaction.kind === "idle" ? [] : interaction.guides;

  return {
    interaction,
    guides,
    isWidgetPreviewActive,
    resolveLayout,
    onFramePointerDown: beginMove,
    onResizePointerDown: beginResize,
    onLostPointerCapture,
  };
}
