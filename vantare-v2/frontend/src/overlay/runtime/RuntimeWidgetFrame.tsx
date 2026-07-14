import type { CSSProperties } from "react";
import type { WidgetInstanceV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { useRateLimitedTelemetry } from "./use-rate-limited-telemetry";

export type RuntimeWidgetFrameProps = {
  widget: WidgetInstanceV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
};

export function RuntimeWidgetFrame(props: RuntimeWidgetFrameProps): React.ReactElement {
  const { widget, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics } = props;
  const snapshot = useRateLimitedTelemetry(telemetry, widget.behavior.updateHz);
  const origin = layoutOrigin ?? { x: 0, y: 0 };
  const { x, y, w, h, zIndex } = widget.layout;

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: x - origin.x,
    top: y - origin.y,
    width: w,
    height: h,
    zIndex,
    pointerEvents: "none",
    overflow: "hidden",
  };

  return (
    <div data-testid="runtime-widget-frame" data-widget-id={widget.id} style={frameStyle}>
      <WidgetVisualViewport
        widgetType={widget.type}
        layout={widget.layout}
        testId={`runtime-widget-viewport-${widget.id}`}
      >
        <WidgetVisualHost
          widget={widget}
          snapshot={snapshot}
          renderMode={renderMode}
          onDiagnostic={onDiagnostic}
          diagnostics={diagnostics}
        />
      </WidgetVisualViewport>
    </div>
  );
}
