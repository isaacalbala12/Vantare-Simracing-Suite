import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  SessionLayoutType,
  WidgetInstanceV3,
  WidgetLayoutV3,
} from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import type { StudioCommand } from "../state/studio-command";
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
      start: WidgetLayoutV3;
      preview: WidgetLayoutV3;
      guides: SnapGuide[];
    }
  | {
      kind: "resize";
      widgetId: string;
      pointerId: number;
      handle: ResizeHandle;
      pointerOrigin: Point;
      sceneRect: DOMRectLike;
      start: WidgetLayoutV3;
      preview: WidgetLayoutV3;
      guides: SnapGuide[];
    };

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
  resolveLayout(widget: WidgetInstanceV3): WidgetLayoutV3;
  onFramePointerDown(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown(
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ): void;
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
  const interactionRef = useRef<CanvasInteraction>({ kind: "idle" });
  const interactionFrameRef = useRef<number | null>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const flushInteractionFrame = useCallback(() => {
    if (interactionFrameRef.current !== null) {
      cancelAnimationFrame(interactionFrameRef.current);
      interactionFrameRef.current = null;
    }
  }, []);

  const setInteractionState = useCallback((next: CanvasInteraction) => {
    interactionRef.current = next;
    if (next.kind === "idle") {
      flushInteractionFrame();
      setInteraction(next);
      return;
    }

    if (interactionFrameRef.current !== null) {
      return;
    }

    interactionFrameRef.current = requestAnimationFrame(() => {
      interactionFrameRef.current = null;
      setInteraction(interactionRef.current);
    });
  }, [flushInteractionFrame]);

  useEffect(() => () => flushInteractionFrame(), [flushInteractionFrame]);

  const cancelInteraction = useCallback(() => {
    setInteractionState({ kind: "idle" });
  }, [setInteractionState]);

  const commitInteraction = useCallback(() => {
    const current = interactionRef.current;
    if (current.kind === "idle") {
      return;
    }
    if (!layoutGeometryChanged(current.start, current.preview)) {
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
    setInteractionState({ kind: "idle" });
  }, [setInteractionState]);

  const updatePointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }

    const { widgets, scale, sceneRef } = inputRef.current;
    const widget = widgets.find((entry) => entry.id === current.widgetId);
    if (!widget) {
      cancelInteraction();
      return;
    }

    const pointerCurrent = toLogicalPoint(
      event.clientX,
      event.clientY,
      sceneRef,
      scale,
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
      setInteractionState({
        ...current,
        preview: next.layout,
        guides: next.guides,
      });
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
    setInteractionState({
      ...current,
      preview: next.layout,
      guides: next.guides,
    });
  }, [cancelInteraction, setInteractionState]);

  const endPointer = useCallback((event: PointerEvent) => {
    const current = interactionRef.current;
    if (current.kind === "idle" || event.pointerId !== current.pointerId) {
      return;
    }
    flushInteractionFrame();
    commitInteraction();
  }, [commitInteraction, flushInteractionFrame]);

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
    inputRef.current.selectWidget(widgetId);

    const sceneRect = getSceneRect(inputRef.current.sceneRef);
    if (!sceneRect) {
      return;
    }

    const pointerOrigin = toLogicalPoint(
      event.clientX,
      event.clientY,
      inputRef.current.sceneRef,
      inputRef.current.scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);

    setInteractionState({
      kind: "move",
      widgetId,
      pointerId: event.pointerId,
      pointerOrigin,
      sceneRect,
      start,
      preview: start,
      guides: [],
    });
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
    inputRef.current.selectWidget(widgetId);

    const sceneRect = getSceneRect(inputRef.current.sceneRef);
    if (!sceneRect) {
      return;
    }

    const pointerOrigin = toLogicalPoint(
      event.clientX,
      event.clientY,
      inputRef.current.sceneRef,
      inputRef.current.scale,
      sceneRect,
    );
    const start = structuredClone(widget.layout);

    setInteractionState({
      kind: "resize",
      widgetId,
      pointerId: event.pointerId,
      handle,
      pointerOrigin,
      sceneRect,
      start,
      preview: start,
      guides: [],
    });
  }, [setInteractionState]);

  const resolveLayout = useCallback((widget: WidgetInstanceV3): WidgetLayoutV3 => {
    if (interaction.kind === "idle" || interaction.widgetId !== widget.id) {
      return widget.layout;
    }
    return interaction.preview;
  }, [interaction]);

  const guides = interaction.kind === "idle" ? [] : interaction.guides;

  return {
    interaction,
    guides,
    resolveLayout,
    onFramePointerDown: beginMove,
    onResizePointerDown: beginResize,
  };
}