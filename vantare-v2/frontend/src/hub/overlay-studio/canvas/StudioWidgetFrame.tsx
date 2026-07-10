import { memo, type CSSProperties } from "react";
import type { WidgetInstanceV3, WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import type { ResizeHandle } from "./canvas-resize";
import { resolveWidgetIntrinsicScale } from "./widget-intrinsic-scale";

const MemoWidgetVisualHost = memo(WidgetVisualHost);

function layoutsEqual(left: WidgetLayoutV3, right: WidgetLayoutV3): boolean {
  return (
    left.x === right.x
    && left.y === right.y
    && left.w === right.w
    && left.h === right.h
    && left.zIndex === right.zIndex
    && left.aspectLocked === right.aspectLocked
  );
}

const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export type StudioWidgetFrameProps = {
  widget: WidgetInstanceV3;
  layout: WidgetLayoutV3;
  previewActive?: boolean;
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

function StudioWidgetFrameComponent(props: StudioWidgetFrameProps): React.ReactElement {
  const {
    widget,
    layout,
    previewActive = false,
    selected,
    snapshot,
    onSelect,
    onFramePointerDown,
    onResizePointerDown,
  } = props;
  const intrinsic = resolveWidgetIntrinsicScale(layout, widget.type);

  const frameStyle: CSSProperties = previewActive
    ? {
        position: "absolute",
        zIndex: layout.zIndex,
      }
    : {
        position: "absolute",
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.w}px`,
        height: `${layout.h}px`,
        zIndex: layout.zIndex,
      };

  const frameClassName = [
    "osv3-widget-frame",
    selected ? "osv3-widget-frame--selected" : "",
    previewActive ? "osv3-widget-frame--interacting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-testid={`studio-widget-frame-${widget.id}`}
      className={frameClassName}
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
          <MemoWidgetVisualHost
            widget={widget}
            snapshot={snapshot}
            renderMode="studio"
          />
        </div>
      </div>
    </div>
  );
}

export const StudioWidgetFrame = memo(
  StudioWidgetFrameComponent,
  (previous, next) =>
    previous.widget === next.widget
    && layoutsEqual(previous.layout, next.layout)
    && previous.previewActive === next.previewActive
    && previous.selected === next.selected
    && previous.snapshot === next.snapshot
    && previous.onSelect === next.onSelect
    && previous.onFramePointerDown === next.onFramePointerDown
    && previous.onResizePointerDown === next.onResizePointerDown,
);