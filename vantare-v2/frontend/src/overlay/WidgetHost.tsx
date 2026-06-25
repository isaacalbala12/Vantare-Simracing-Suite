import { type ReactNode } from "react";
import type { ProfileConfig, Rect, WidgetConfig } from "../lib/profile";
import { getWidgetBaseSize, normalizeWidgetVisualRect } from "./widgets/widget-base-size";

type WidgetHostProps = {
  id: string;
  position: Rect; // window-local coordinates
  widget?: WidgetConfig;
  profile?: ProfileConfig | null;
  children: ReactNode;
};

export function WidgetHost({ id, position, widget, profile, children }: WidgetHostProps) {
  const baseSize = widget && profile ? getWidgetBaseSize(widget.type, widget, profile) : null;
  const visualPos = normalizeWidgetVisualRect(position, baseSize);
  const scale = baseSize
    ? Math.min(visualPos.w / baseSize.width, visualPos.h / baseSize.height)
    : 1;

  return (
    <div
      id={`widget-${id}`}
      className="absolute pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${visualPos.w}px`,
        height: `${visualPos.h}px`,
        overflow: "hidden",
      }}
    >
      {baseSize ? (
        <div
          data-testid="widget-host-scaler"
          style={{
            width: baseSize.width,
            height: baseSize.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
