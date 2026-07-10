import type { CSSProperties } from "react";
import type { WidgetInstanceV3, WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import type { ResizeHandle } from "./canvas-resize";
import { resolveWidgetIntrinsicScale } from "./widget-intrinsic-scale";

const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export type StudioWidgetFrameProps = {
  widget: WidgetInstanceV3;
  layout: WidgetLayoutV3;
  selected: boolean;
  snapshot: TelemetrySnapshot;
  onSelect(widgetId: string): void;
  onFramePointerDown?(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown?(
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ): void;
};

export function StudioWidgetFrame(props: StudioWidgetFrameProps): React.ReactElement {
  const {
    widget,
    layout,
    selected,
    snapshot,
    onSelect,
    onFramePointerDown,
    onResizePointerDown,
  } = props;
  const intrinsic = resolveWidgetIntrinsicScale(layout, widget.type);

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: `${layout.x}px`,
    top: `${layout.y}px`,
    width: `${layout.w}px`,
    height: `${layout.h}px`,
    zIndex: layout.zIndex,
  };

  return (
    <div
      data-testid={`studio-widget-frame-${widget.id}`}
      className={selected ? "osv3-widget-frame osv3-widget-frame--selected" : "osv3-widget-frame"}
      style={frameStyle}
      onPointerDown={(event) => {
        if (onFramePointerDown) {
          onFramePointerDown(widget.id, event);
          return;
        }
        event.stopPropagation();
        onSelect(widget.id);
      }}
      onLostPointerCapture={() => undefined}
    >
      {selected ? (
        <div data-testid={`studio-widget-frame-chrome-${widget.id}`} className="osv3-widget-frame__chrome" />
      ) : null}
      {!widget.behavior.enabled ? (
        <span data-testid={`studio-widget-hidden-badge-${widget.id}`} className="osv3-widget-frame__hidden-badge">
          Oculto
        </span>
      ) : null}
      {selected && onResizePointerDown
        ? RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              data-testid={`studio-resize-handle-${handle}-${widget.id}`}
              className={`osv3-resize-handle osv3-resize-handle--${handle}`}
              aria-label={`Resize ${handle}`}
              onPointerDown={(event) => onResizePointerDown(widget.id, handle, event)}
            />
          ))
        : null}
      <div data-testid={`studio-widget-visual-${widget.id}`} className="osv3-widget-frame__visual">
        <div
          data-testid={`studio-widget-intrinsic-scaler-${widget.id}`}
          className="osv3-widget-frame__scaler"
          style={{
            width: intrinsic.baseSize.width,
            height: intrinsic.baseSize.height,
            transform: `scale(${intrinsic.scale})`,
            transformOrigin: "top left",
          }}
        >
          <WidgetVisualHost
            widget={{ ...widget, layout }}
            snapshot={snapshot}
            renderMode="studio"
          />
        </div>
      </div>
    </div>
  );
}