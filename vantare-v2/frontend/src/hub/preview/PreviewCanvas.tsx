import { useEffect, useRef, useState } from "react";
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

function nudge(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export function PreviewCanvas({ profile, selectedWidgetId, onSelectWidget, onChangeProfile, disabled = false }: PreviewCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(MAX_CANVAS_WIDTH);
  const selectedWidget = profile.widgets.find((widget) => widget.id === selectedWidgetId);
  const scale = canvasWidth / LOGICAL_WIDTH;

  const [dragState, setDragState] = useState<{
    widgetId: string;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    moved: boolean;
  } | null>(null);

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

  function onMouseDown(event: React.MouseEvent, widgetId: string) {
    if (disabled) return;
    if ((event.target as HTMLElement).dataset.testid?.startsWith("resize-handle-")) return;
    event.preventDefault();
    const widget = profile.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    onSelectWidget(widgetId);
    const point = toCanvasPoint(event.clientX, event.clientY);
    setDragState({
      widgetId,
      startX: point.x,
      startY: point.y,
      startPos: { x: widget.position.x, y: widget.position.y },
      moved: false,
    });
  }

  function onMouseMove(event: React.MouseEvent) {
    if (!dragState) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    const dxRaw = (point.x - dragState.startX) / scale;
    const dyRaw = (point.y - dragState.startY) / scale;
    if (Math.abs(dxRaw) < 1 && Math.abs(dyRaw) < 1 && !dragState.moved) {
      return;
    }
    const widget = profile.widgets.find((w) => w.id === dragState.widgetId);
    if (!widget) return;

    const rawX = Math.round(dragState.startPos.x + dxRaw);
    const rawY = Math.round(dragState.startPos.y + dyRaw);
    const snappedX = snap(rawX);
    const snappedY = snap(rawY);
    const { x, y } = clampPosition(snappedX, snappedY, widget.position.w, widget.position.h);
    const nextPos = { ...widget.position, x, y };

    onChangeProfile(updateWidgetPosition(profile, widget.id, nextPos));
    setDragState((prev) => (prev ? { ...prev, moved: true } : null));
  }

  function onMouseUp() {
    setDragState(null);
  }
  function handleChangePosition(widgetId: string, position: Rect) {
    onChangeProfile(updateWidgetPosition(profile, widgetId, position));
  }


  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!selectedWidget) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, nudge(selectedWidget.position, -step, 0)));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, nudge(selectedWidget.position, step, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, nudge(selectedWidget.position, 0, -step)));
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, nudge(selectedWidget.position, 0, step)));
    }
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
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
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
            onSelect={onSelectWidget}
            onDragStart={onMouseDown}
            onChangePosition={handleChangePosition}
            scale={scale}
            disabled={disabled}
          />
          ))}
        </div>
      </div>
    </div>
  );
}
