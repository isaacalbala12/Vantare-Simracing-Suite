import type { CSSProperties } from "react";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import { resolveWidgetIntrinsicScale } from "./widget-intrinsic-scale";

export type StudioWidgetFrameProps = {
  widget: WidgetInstanceV3;
  selected: boolean;
  snapshot: TelemetrySnapshot;
  onSelect(widgetId: string): void;
};

export function StudioWidgetFrame(props: StudioWidgetFrameProps): React.ReactElement {
  const { widget, selected, snapshot, onSelect } = props;
  const intrinsic = resolveWidgetIntrinsicScale(widget.layout, widget.type);

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: `${widget.layout.x}px`,
    top: `${widget.layout.y}px`,
    width: `${widget.layout.w}px`,
    height: `${widget.layout.h}px`,
    zIndex: widget.layout.zIndex,
  };

  return (
    <div
      data-testid={`studio-widget-frame-${widget.id}`}
      className={selected ? "osv3-widget-frame osv3-widget-frame--selected" : "osv3-widget-frame"}
      style={frameStyle}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(widget.id);
      }}
    >
      {selected ? (
        <div data-testid={`studio-widget-frame-chrome-${widget.id}`} className="osv3-widget-frame__chrome" />
      ) : null}
      {!widget.behavior.enabled ? (
        <span data-testid={`studio-widget-hidden-badge-${widget.id}`} className="osv3-widget-frame__hidden-badge">
          Oculto
        </span>
      ) : null}
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
          <WidgetVisualHost widget={widget} snapshot={snapshot} renderMode="studio" />
        </div>
      </div>
    </div>
  );
}