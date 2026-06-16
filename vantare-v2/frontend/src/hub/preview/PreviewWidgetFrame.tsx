import { useRef } from "react";
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
import { clampSize, resizeWithRatio } from "../../lib/canvas-math";

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

type PreviewWidgetFrameProps = {
  widget: WidgetConfig;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart?: (event: React.MouseEvent, widgetId: string) => void;
  onChangePosition?: (widgetId: string, position: Rect) => void;
  scale?: number;
  disabled?: boolean;
};

export function PreviewWidgetFrame({ widget, selected, onSelect, onDragStart, onChangePosition, scale = 0.5, disabled = false }: PreviewWidgetFrameProps) {
  const style = getWidgetStyle(widget);
  const Component = WIDGETS[widget.type];
  const onChangePositionRef = useRef(onChangePosition);
  onChangePositionRef.current = onChangePosition;

  function handleResizeMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startW = widget.position.w;
    const startH = widget.position.h;
    const startX = widget.position.x;
    const startY = widget.position.y;
    const widgetType = widget.type;
    const widgetId = widget.id;

    function onMouseMove(ev: MouseEvent) {
      const deltaX = (ev.clientX - startMouseX) / scale;
      const deltaY = (ev.clientY - startMouseY) / scale;
      const { w, h } = resizeWithRatio(widgetType, startW, startH, deltaX, deltaY);
      const clamped = clampSize(w, h, startX, startY);
      onChangePositionRef.current?.(widgetId, {
        x: clamped.x,
        y: clamped.y,
        w: clamped.w,
        h: clamped.h,
      });
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      data-testid={`preview-widget-frame-${widget.id}`}
      onMouseDown={(e) => {
        onSelect(widget.id);
        onDragStart?.(e, widget.id);
      }}
      className={`absolute text-left border transition-colors cursor-pointer ${
        selected ? "border-vantare-red-400" : "border-white/15 hover:border-white/30"
      } ${widget.enabled ? "" : "border-dashed"} ${
        disabled ? "pointer-events-none" : ""
      }`}
      style={{
        left: widget.position.x,
        top: widget.position.y,
        width: widget.position.w,
        height: widget.position.h,
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
}
