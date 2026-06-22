import { useEffect, useRef, useState } from "react";
import type { ProfileConfig, Rect, WidgetConfig } from "../../lib/profile";
import { clampSize, snap } from "../../lib/canvas-math";
import { WidgetRenderer } from "./WidgetRenderer";

const MIN_SIZE = { w: 80, h: 40 };

function normalizeRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.max(MIN_SIZE.w, Math.round(rect.w)),
    h: Math.max(MIN_SIZE.h, Math.round(rect.h)),
  };
}

type PreviewWidgetFrameProps = {
  widget: WidgetConfig;
  selected: boolean;
  scale: number;
  onSelect: (id: string) => void;
  onDragStart?: (event: React.MouseEvent, widgetId: string) => void;
  onChangePosition?: (widgetId: string, position: Rect) => void;
  disabled?: boolean;
  profile?: ProfileConfig | null;
};

export const PreviewWidgetFrame = function PreviewWidgetFrame({
  widget,
  selected,
  scale,
  onSelect,
  onDragStart,
  onChangePosition,
  disabled = false,
  profile,
}: PreviewWidgetFrameProps) {
  // Local visual position during drag/resize to avoid parent re-renders.
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const visualRect = previewRect ?? widget.position ?? { x: 0, y: 0, w: 200, h: 200 };

  const committedRef = useRef(onChangePosition);
  useEffect(() => {
    committedRef.current = onChangePosition;
  }, [onChangePosition]);

  function handleMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    onSelect(widget.id);
    onDragStart?.(e, widget.id);
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startRect = { ...widget.position };

    let lastRect: Rect = startRect;

    function onMouseMove(ev: MouseEvent) {
      const deltaX = (ev.clientX - startMouseX) / scale;
      const deltaY = (ev.clientY - startMouseY) / scale;

      const w = Math.max(MIN_SIZE.w, startRect.w + deltaX);
      const h = Math.max(MIN_SIZE.h, startRect.h + deltaY);
      const clamped = clampSize(w, h, startRect.x, startRect.y);
      lastRect = {
        x: startRect.x,
        y: startRect.y,
        w: snap(clamped.w),
        h: snap(clamped.h),
      };
      setPreviewRect(lastRect);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setPreviewRect(null);
      committedRef.current?.(widget.id, normalizeRect(lastRect));
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      data-testid={`preview-widget-frame-${widget.id}`}
      onMouseDown={handleMouseDown}
      className={`absolute text-left border transition-colors cursor-pointer ${
        selected ? "border-vantare-red-400" : "border-white/15 hover:border-white/30"
      } ${widget.enabled ? "" : "border-dashed"} ${
        disabled ? "pointer-events-none" : ""
      }`}
      style={{
        left: visualRect.x,
        top: visualRect.y,
        width: visualRect.w,
        height: visualRect.h,
        transform: "translateZ(0)",
        willChange: "left, top, width, height",
      }}
    >
      <div
        className={`w-full h-full overflow-hidden ${widget.enabled ? "" : "opacity-45 grayscale"}`}
        style={{ pointerEvents: "none" }}
      >
        <WidgetRenderer
          profile={profile}
          widget={widget}
          editMode
          telemetryMode="mock"
          updateHz={widget.updateHz}
          disabled
        />
      </div>
      {!widget.enabled && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      )}
      {selected && !disabled && (
        <div
          data-testid={`resize-handle-${widget.id}`}
          className="absolute bottom-0 right-0 w-[10px] h-[10px] bg-vantare-red-400 cursor-se-resize"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
};
