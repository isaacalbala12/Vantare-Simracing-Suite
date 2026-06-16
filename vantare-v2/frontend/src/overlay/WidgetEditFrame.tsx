import { useEffect, useRef, useState } from "react";
import type { Rect, WidgetConfig } from "../lib/profile";
import { getWidgetStyle } from "../lib/profile";
import { WIDGET_COMPONENTS } from "./shared-widget-map";

const MIN_SIZE = { w: 80, h: 40 };

function getScreenBounds(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function clampRect(rect: Rect): Rect {
  const bounds = getScreenBounds();
  const w = Math.max(MIN_SIZE.w, Math.min(rect.w, bounds.width));
  const h = Math.max(MIN_SIZE.h, Math.min(rect.h, bounds.height));
  const x = Math.max(0, Math.min(rect.x, bounds.width - w));
  const y = Math.max(0, Math.min(rect.y, bounds.height - h));
  return { x, y, w, h };
}

type WidgetEditFrameProps = {
  widget: WidgetConfig;
  onChange: (widgetId: string, rect: Rect) => void;
};

export function WidgetEditFrame({ widget, onChange }: WidgetEditFrameProps) {
  const Component = WIDGET_COMPONENTS[widget.type];
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const visualRect = previewRect ?? widget.position;
  const committedRef = useRef(onChange);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    committedRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    function handleResize() {
      // If the window is resized while a widget is outside the new bounds,
      // commit a clamped version so it remains reachable.
      const current = previewRect ?? widget.position;
      const clamped = clampRect(current);
      if (
        clamped.x !== current.x ||
        clamped.y !== current.y ||
        clamped.w !== current.w ||
        clamped.h !== current.h
      ) {
        setPreviewRect(clamped);
        committedRef.current(widget.id, clamped);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [widget.id, widget.position, previewRect]);

  function handleDragStart(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.testid?.startsWith("resize-handle-")) return;
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startRect = { ...widget.position };
    let lastRect = startRect;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      lastRect = clampRect({
        x: Math.round(startRect.x + dx),
        y: Math.round(startRect.y + dy),
        w: startRect.w,
        h: startRect.h,
      });
      setPreviewRect(lastRect);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setPreviewRect(null);
      committedRef.current(widget.id, lastRect);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startRect = { ...widget.position };
    let lastRect = startRect;

    function onMouseMove(ev: MouseEvent) {
      const dw = ev.clientX - startMouseX;
      const dh = ev.clientY - startMouseY;
      lastRect = clampRect({
        ...startRect,
        w: Math.round(startRect.w + dw),
        h: Math.round(startRect.h + dh),
      });
      setPreviewRect(lastRect);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setPreviewRect(null);
      committedRef.current(widget.id, lastRect);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const style = getWidgetStyle(widget);

  return (
    <div
      ref={frameRef}
      data-testid={`edit-frame-${widget.id}`}
      onMouseDown={handleDragStart}
      className="absolute border border-vantare-red-400/70 hover:border-vantare-red-400 cursor-move"
      style={{
        left: visualRect.x,
        top: visualRect.y,
        width: visualRect.w,
        height: visualRect.h,
      }}
    >
      {Component && (
        <div className="w-full h-full overflow-hidden" style={{ pointerEvents: "none" }}>
          <Component
            editMode={true}
            telemetryMode="mock"
            updateHz={widget.updateHz}
            props={{ ...widget.props, style }}
          />
        </div>
      )}
      <div
        data-testid={`resize-handle-${widget.id}`}
        className="absolute bottom-0 right-0 w-[12px] h-[12px] bg-vantare-red-500 cursor-se-resize"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
