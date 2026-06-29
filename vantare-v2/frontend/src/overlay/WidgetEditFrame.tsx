import { useEffect, useMemo, useRef, useState } from "react";
import type { Rect, WidgetConfig } from "../lib/profile";
import { getWidgetStyle } from "../lib/profile";
import { WIDGET_COMPONENTS } from "./shared-widget-map";
import { resizeWithRatio, WIDGET_MIN_SIZE } from "../lib/canvas-math";
import { getWidgetBaseSize, normalizeWidgetVisualRect } from "./widgets/widget-base-size";

const MIN_SIZE = WIDGET_MIN_SIZE;

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

function applyRectToFrame(el: HTMLElement, rect: Rect, baseSize: { width: number; height: number } | null, scalerEl: HTMLElement | null) {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.w}px`;
  el.style.height = `${rect.h}px`;
  if (scalerEl && baseSize && baseSize.width > 0 && baseSize.height > 0) {
    const BORDER_PX = 2;
    const s = Math.min((rect.w - BORDER_PX) / baseSize.width, (rect.h - BORDER_PX) / baseSize.height);
    scalerEl.style.transform = `scale(${s})`;
  }
}

type WidgetEditFrameProps = {
  widget: WidgetConfig;
  onChange: (widgetId: string, rect: Rect) => void;
};

export function WidgetEditFrame({ widget, onChange }: WidgetEditFrameProps) {
  const Component = WIDGET_COMPONENTS[widget.type];
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const baseSize = getWidgetBaseSize(widget.type, widget, null);
  const normalizedPosition = normalizeWidgetVisualRect(widget.position, baseSize);
  const visualRect = previewRect ?? normalizedPosition;
  const committedRef = useRef(onChange);
  const frameRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const BORDER_PX = 2;
  const contentW = visualRect.w - BORDER_PX;
  const contentH = visualRect.h - BORDER_PX;
  const scale = baseSize
    ? Math.min(contentW / baseSize.width, contentH / baseSize.height)
    : 1;

  useEffect(() => {
    committedRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    function handleResize() {
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
    const startRect = { ...visualRect };
    const frame = frameRef.current;
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
      if (frame) {
        applyRectToFrame(frame, lastRect, baseSize, scalerRef.current);
      }
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
    const startRect = { ...visualRect };
    const resizeBaseSize = getWidgetBaseSize(widget.type, widget, null);
    const baseAspect = resizeBaseSize ? resizeBaseSize.width / resizeBaseSize.height : undefined;
    const frame = frameRef.current;
    let lastRect = startRect;

    function onMouseMove(ev: MouseEvent) {
      const dw = ev.clientX - startMouseX;
      const dh = ev.clientY - startMouseY;
      const sized = resizeWithRatio(widget.type, startRect.w, startRect.h, dw, dh, baseAspect, false);
      lastRect = clampRect({
        ...startRect,
        w: sized.w,
        h: sized.h,
      });
      if (frame) {
        applyRectToFrame(frame, lastRect, resizeBaseSize, scalerRef.current);
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setPreviewRect(null);
      committedRef.current(widget.id, {
        x: Math.round(lastRect.x),
        y: Math.round(lastRect.y),
        w: Math.round(lastRect.w),
        h: Math.round(lastRect.h),
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const style = getWidgetStyle(widget);
  const widgetProps = useMemo(() => ({ ...widget.props, style }), [widget.props, style]);

  return (
    <div
      ref={frameRef}
      data-testid={`edit-frame-${widget.id}`}
      onMouseDown={handleDragStart}
      className="absolute border border-vantare-red-400/70 hover:border-vantare-red-400 cursor-move select-none"
      style={{
        left: visualRect.x,
        top: visualRect.y,
        width: visualRect.w,
        height: visualRect.h,
        pointerEvents: "auto",
        zIndex: 50,
        willChange: "left, top, width, height",
      }}
    >
      {Component && (
        <div className="w-full h-full overflow-hidden relative" style={{ pointerEvents: "none" }}>
          {baseSize ? (
            <div
              ref={scalerRef}
              data-testid="edit-frame-scaler"
              style={{
                width: baseSize.width,
                height: baseSize.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <Component
                editMode={true}
                telemetryMode="mock"
                updateHz={widget.updateHz}
                props={widgetProps}
              />
            </div>
          ) : (
            <Component
              editMode={true}
              telemetryMode="mock"
              updateHz={widget.updateHz}
              props={widgetProps}
            />
          )}
          <div className="absolute inset-0 bg-transparent z-10" style={{ pointerEvents: "auto" }} />
        </div>
      )}
      <div
        data-testid={`resize-handle-${widget.id}`}
        className="absolute bottom-0 right-0 w-[12px] h-[12px] bg-vantare-red-500 cursor-se-resize z-20"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
