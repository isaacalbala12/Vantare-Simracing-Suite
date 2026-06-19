import { useEffect, useRef, useState, useCallback } from "react";
import { clampPosition, snap } from "../../lib/canvas-math";
import type { ProfileConfig, Rect } from "../../lib/profile";
import { updateWidgetPosition } from "./profile-editor";
import { PreviewWidgetFrame } from "./PreviewWidgetFrame";

type PreviewCanvasProps = {
  profile: ProfileConfig;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string) => void;
  onChangeProfile: (profile: ProfileConfig) => void;
  disabled?: boolean;
};

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;
const MAX_CANVAS_WIDTH = 960;

export function PreviewCanvas({ profile, selectedWidgetId, onSelectWidget, onChangeProfile, disabled = false }: PreviewCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(MAX_CANVAS_WIDTH);
  const selectedWidget = profile.widgets.find((widget) => widget.id === selectedWidgetId);
  const scale = canvasWidth / LOGICAL_WIDTH;

  const dragRef = useRef<{
    widgetId: string;
    startMouseX: number;
    startMouseY: number;
    startPos: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const commitRef = useRef(onChangeProfile);
  useEffect(() => {
    commitRef.current = onChangeProfile;
  }, [onChangeProfile]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;

    const updateWidth = () => {
      const measuredWidth = node.clientWidth || MAX_CANVAS_WIDTH;
      const width = Math.min(MAX_CANVAS_WIDTH, Math.max(280, measuredWidth));
      setCanvasWidth(width);
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  const handleMouseMove = useCallback((e: MouseEvent) => onMouseMoveRef.current?.(e), []);
  const handleMouseUp = useCallback(() => onMouseUpRef.current?.(), []);

  const attachMouseListeners = useCallback(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
  }, [handleMouseMove, handleMouseUp]);

  const detachMouseListeners = useCallback(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  const onMouseDown = useCallback((event: React.MouseEvent, widgetId: string) => {
    if (disabled) return;
    if ((event.target as HTMLElement).dataset.testid?.startsWith("resize-handle-")) return;
    event.preventDefault();
    const widget = profile.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    dragRef.current = {
      widgetId,
      startMouseX: point.x,
      startMouseY: point.y,
      startPos: { x: widget.position.x, y: widget.position.y },
      moved: false,
    };
    attachMouseListeners();
  }, [disabled, profile.widgets, attachMouseListeners]);

  const onMouseMove = useCallback((event: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const point = toCanvasPoint(event.clientX, event.clientY);
    const dxRaw = (point.x - drag.startMouseX) / scale;
    const dyRaw = (point.y - drag.startMouseY) / scale;

    // Require at least 1 logical pixel of movement before treating it as a real drag.
    if (Math.abs(dxRaw) < 1 && Math.abs(dyRaw) < 1 && !drag.moved) {
      return;
    }

    const rawX = Math.round(drag.startPos.x + dxRaw);
    const rawY = Math.round(drag.startPos.y + dyRaw);
    const snappedX = snap(rawX);
    const snappedY = snap(rawY);
    const { x, y } = clampPosition(snappedX, snappedY, profile.widgets.find((w) => w.id === drag.widgetId)?.position.w ?? 0, profile.widgets.find((w) => w.id === drag.widgetId)?.position.h ?? 0);
    const nextPos = { x, y };

    // Move the DOM element directly to avoid parent re-renders.
    const frame = document.querySelector(`[data-testid="preview-widget-frame-${drag.widgetId}"]`) as HTMLElement | null;
    if (frame) {
      frame.style.left = `${nextPos.x}px`;
      frame.style.top = `${nextPos.y}px`;
    }

    drag.moved = true;
  }, [scale, profile.widgets]);

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    detachMouseListeners();
    if (!drag || !drag.moved) return;

    const widget = profile.widgets.find((w) => w.id === drag.widgetId);
    if (!widget) return;

    const frame = document.querySelector(`[data-testid="preview-widget-frame-${drag.widgetId}"]`) as HTMLElement | null;
    const finalX = frame ? parseInt(frame.style.left || `${widget.position.x}`, 10) : widget.position.x;
    const finalY = frame ? parseInt(frame.style.top || `${widget.position.y}`, 10) : widget.position.y;

    commitRef.current(updateWidgetPosition(profile, drag.widgetId, { ...widget.position, x: finalX, y: finalY }));
  }, [profile, detachMouseListeners]);

  const onMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const onMouseUpRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    onMouseMoveRef.current = onMouseMove;
    // eslint-disable-next-line react-hooks/immutability
    onMouseUpRef.current = onMouseUp;
  }, [onMouseMove, onMouseUp]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || !selectedWidget) return;
    const step = event.shiftKey ? 8 : 1;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      default:
        return;
    }
    event.preventDefault();
    const { x, y } = clampPosition(
      selectedWidget.position.x + dx,
      selectedWidget.position.y + dy,
      selectedWidget.position.w,
      selectedWidget.position.h,
    );
    onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, { ...selectedWidget.position, x, y }));
  }

  function handleChangePosition(widgetId: string, position: Rect) {
    onChangeProfile(updateWidgetPosition(profile, widgetId, position));
  }

  return (
    <div ref={shellRef} className="glass-panel rounded-xl p-4 overflow-hidden">
      <div className="mb-3 flex items-center justify-between text-xs font-mono text-vantare-textMuted">
        <span>{profile.name || profile.id || "Perfil activo"}</span>
        <span>1920×1080</span>
      </div>
      <div
        ref={canvasRef}
        data-testid="preview-viewport"
        className="relative mx-auto bg-black/40 border border-white/10 overflow-hidden outline-none"
        style={{ width: canvasWidth, height: LOGICAL_HEIGHT * scale }}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
      >
        <div
          data-testid="preview-scene"
          className="absolute left-0 top-0"
          style={{
            width: LOGICAL_WIDTH,
            height: LOGICAL_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          {profile.widgets.map((widget) => (
            <PreviewWidgetFrame
              key={widget.id}
              widget={widget}
              selected={widget.id === selectedWidgetId}
              scale={scale}
              onSelect={onSelectWidget}
              onDragStart={onMouseDown}
              onChangePosition={handleChangePosition}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
