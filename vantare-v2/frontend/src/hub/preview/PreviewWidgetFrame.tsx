import { useRef, useState } from "react";
import type { Rect, WidgetConfig } from "../../lib/profile";
import { getWidgetStyle } from "../../lib/profile";
import { DeltaWidget } from "../../overlay/widgets/DeltaWidget";
import { RelativeWidget } from "../../overlay/widgets/RelativeWidget";
import { StandingsWidget } from "../../overlay/widgets/StandingsWidget";
import { TelemetryWidget } from "../../overlay/widgets/TelemetryWidget";
import { TelemetryVerticalWidget } from "../../overlay/widgets/TelemetryVerticalWidget";
import { PedalsWidget } from "../../overlay/widgets/PedalsWidget";
import type { ComponentType } from "react";
import type { WidgetTelemetryMode } from "../../overlay/widgets/use-widget-telemetry";
import { clampSize, snap } from "../../lib/canvas-math";

type WidgetProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  delta: DeltaWidget,
  relative: RelativeWidget,
  standings: StandingsWidget,
  telemetry: TelemetryWidget,
  "telemetry-vertical": TelemetryVerticalWidget,
  pedals: PedalsWidget,
};

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
};

export const PreviewWidgetFrame = function PreviewWidgetFrame({
  widget,
  selected,
  scale,
  onSelect,
  onDragStart,
  onChangePosition,
  disabled = false,
}: PreviewWidgetFrameProps) {
  const style = getWidgetStyle(widget);
  const Component = WIDGETS[widget.type];

  // Local visual position during drag/resize to avoid parent re-renders.
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const visualRect = previewRect ?? widget.position;

  const committedRef = useRef(onChangePosition);
  committedRef.current = onChangePosition;

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
      }}
    >
      {Component ? (
        <div
          className={`w-full h-full overflow-hidden ${widget.enabled ? "" : "opacity-45 grayscale"}`}
          style={{ pointerEvents: "none" }}
        >
          <Component editMode={true} telemetryMode="mock" updateHz={widget.updateHz} props={{ ...widget.props, style }} />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-mono">
          {widget.type}
        </div>
      )}
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
