import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { WidgetInstanceV3, WidgetLayoutV3 } from "../core/profile-document";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { widgetTypeRegistry } from "../core/widget-registry";
import { useRateLimitedWidgetTelemetry } from "../runtime/use-rate-limited-telemetry";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { ResizeHandle } from "../../hub/overlay-studio/canvas/canvas-resize";
import {
  applyInplaceFrameLayoutPreview,
  getInplaceFrameLayoutPreview,
  registerInplaceFrameElement,
  resolveInplaceFrameGeometry,
} from "./inplace-frame-preview";

const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_STYLE: Record<ResizeHandle, CSSProperties> = {
  nw: { top: -5, left: -5, cursor: "nwse-resize" },
  n: { top: -5, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" },
  ne: { top: -5, right: -5, cursor: "nesw-resize" },
  e: { top: "50%", right: -5, transform: "translateY(-50%)", cursor: "ew-resize" },
  se: { right: -5, bottom: -5, cursor: "nwse-resize" },
  s: { bottom: -5, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" },
  sw: { left: -5, bottom: -5, cursor: "nesw-resize" },
  w: { top: "50%", left: -5, transform: "translateY(-50%)", cursor: "ew-resize" },
};

export type InPlaceWidgetEditFrameProps = {
  widget: WidgetInstanceV3;
  layout: WidgetLayoutV3;
  previewActive?: boolean;
  selected: boolean;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  onSelect(widgetId: string): void;
  onFramePointerDown?(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown?(
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ): void;
  onLostPointerCapture?(event: PointerEvent): void;
};

function InPlaceWidgetEditFrameComponent(props: InPlaceWidgetEditFrameProps): React.ReactElement {
  const {
    widget,
    layout,
    previewActive = false,
    selected,
    layoutOrigin,
    telemetry,
    onSelect,
    onFramePointerDown,
    onResizePointerDown,
    onLostPointerCapture,
  } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const origin = layoutOrigin ?? { x: 0, y: 0 };
  const runtime = useRateLimitedWidgetTelemetry(telemetry, widget.type);
  const frameGeometry = resolveInplaceFrameGeometry(widget.id, layout, previewActive);
  const definition = widgetTypeRegistry.get(widget.type);
  const resizeHandles = definition.capabilities.resizeMode === "horizontal-only"
    ? (["e", "w"] as const)
    : RESIZE_HANDLES;

  useLayoutEffect(() => {
    registerInplaceFrameElement(widget.id, frameRef.current);
    return () => registerInplaceFrameElement(widget.id, null);
  }, [widget.id]);

  useLayoutEffect(() => {
    if (!previewActive) {
      return;
    }
    const previewLayout = getInplaceFrameLayoutPreview(widget.id);
    if (!previewLayout) {
      return;
    }
    applyInplaceFrameLayoutPreview(widget.id, previewLayout);
  });

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: frameGeometry.x - origin.x,
    top: frameGeometry.y - origin.y,
    width: frameGeometry.w,
    height: frameGeometry.h,
    zIndex: frameGeometry.zIndex + 1000,
    boxSizing: "border-box",
    touchAction: "none",
    willChange: previewActive ? "left, top, width, height, transform" : undefined,
  };

  const chromeStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    border: selected ? "1.5px solid #e63946" : "1px solid rgba(230, 57, 70, 0.35)",
    borderRadius: 4,
    pointerEvents: "none",
    zIndex: 2,
  };

  return (
    <div
      ref={frameRef}
      data-testid={`inplace-edit-frame-${widget.id}`}
      data-preview-active={previewActive ? "true" : undefined}
      style={frameStyle}
      onPointerDown={(event) => {
        if (onFramePointerDown) {
          onFramePointerDown(widget.id, event);
          return;
        }
        event.stopPropagation();
        onSelect(widget.id);
      }}
      onLostPointerCapture={(event) => onLostPointerCapture?.(event.nativeEvent)}
    >
      <div data-testid={`inplace-edit-chrome-${widget.id}`} style={chromeStyle} />
      {!widget.behavior.enabled ? (
        <span
          data-testid={`inplace-edit-hidden-badge-${widget.id}`}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 3,
            padding: "2px 6px",
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.88)",
            color: "#fbbf24",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          hidden
        </span>
      ) : null}
      {selected && onResizePointerDown
        ? resizeHandles.map((handle) => (
            <button
              key={handle}
              type="button"
              data-testid={`inplace-resize-handle-${handle}-${widget.id}`}
              aria-label={`Resize ${handle}`}
              style={{
                position: "absolute",
                zIndex: 4,
                width: 10,
                height: 10,
                padding: 0,
                border: "1px solid #e63946",
                borderRadius: 2,
                background: "rgba(8, 8, 10, 0.94)",
                ...HANDLE_STYLE[handle],
              }}
              onPointerDown={(event) => onResizePointerDown(widget.id, handle, event)}
              onLostPointerCapture={(event) => onLostPointerCapture?.(event.nativeEvent)}
            />
          ))
        : null}
      <div data-testid={`inplace-edit-visual-${widget.id}`} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <WidgetVisualViewport
          widgetType={widget.type}
          visual={widget.visual}
          layout={frameGeometry}
          testId={`inplace-edit-viewport-${widget.id}`}
        >
          <WidgetVisualHost
            widget={widget}
            renderMode="desktop"
            runtime={runtime}
          />
        </WidgetVisualViewport>
      </div>
    </div>
  );
}

export const InPlaceWidgetEditFrame = memo(
  InPlaceWidgetEditFrameComponent,
  (previous, next) =>
    previous.widget === next.widget
    && previous.layout === next.layout
    && previous.previewActive === next.previewActive
    && previous.selected === next.selected
    && previous.layoutOrigin === next.layoutOrigin
    && previous.onSelect === next.onSelect
    && previous.onFramePointerDown === next.onFramePointerDown
    && previous.onResizePointerDown === next.onResizePointerDown
    && previous.onLostPointerCapture === next.onLostPointerCapture,
);
