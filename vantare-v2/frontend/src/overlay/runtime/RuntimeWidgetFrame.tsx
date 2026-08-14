import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { WidgetInstanceV3, WidgetLayoutV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { WidgetDiagnostic, WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { useRateLimitedTelemetry } from "./use-rate-limited-telemetry";
import type { EngineerPresentation } from "../../engineer/engineer-presentation-store";
import type { ResizeHandle } from "../../hub/overlay-studio/canvas/canvas-resize";
import {
  applyStudioFrameLayoutPreview,
  clearStudioFrameLayoutPreview,
  getStudioFrameLayoutPreview,
  registerStudioFrameElement,
  resolveStudioFrameGeometry,
} from "../../hub/overlay-studio/canvas/canvas-frame-preview";
import { useI18n } from "../../i18n/I18nProvider";

const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export type RuntimeWidgetEditProps = {
  selected: boolean;
  previewActive: boolean;
  onSelect(widgetId: string): void;
  onFramePointerDown(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown(widgetId: string, handle: ResizeHandle, event: React.PointerEvent<HTMLElement>): void;
  onLostPointerCapture(event: PointerEvent): void;
};

export type RuntimeWidgetFrameProps = {
  widget: WidgetInstanceV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  engineerPresentation?: EngineerPresentation | null;
  engineerSubtitlesEnabled?: boolean;
  edit?: RuntimeWidgetEditProps;
};

export function RuntimeWidgetFrame(props: RuntimeWidgetFrameProps): React.ReactElement {
  const { widget, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics, engineerPresentation, engineerSubtitlesEnabled, edit } = props;
  const snapshot = useRateLimitedTelemetry(telemetry, widget.behavior.updateHz);
  const { t } = useI18n();
  const origin = layoutOrigin ?? { x: 0, y: 0 };
  const frameRef = useRef<HTMLDivElement>(null);
  const editing = edit !== undefined;
  const frameGeometry: WidgetLayoutV3 = edit
    ? resolveStudioFrameGeometry(widget.id, widget.layout, edit.previewActive)
    : widget.layout;
  const { x, y, w, h, zIndex } = frameGeometry;

  useLayoutEffect(() => {
    if (!editing) return;
    registerStudioFrameElement(widget.id, frameRef.current);
    return () => {
      clearStudioFrameLayoutPreview(widget.id);
      registerStudioFrameElement(widget.id, null);
    };
  }, [editing, widget.id]);

  useLayoutEffect(() => {
    if (!edit?.previewActive) return;
    const preview = getStudioFrameLayoutPreview(widget.id);
    if (preview) {
      applyStudioFrameLayoutPreview(widget.id, preview);
    }
  });

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: x - origin.x,
    top: y - origin.y,
    width: w,
    height: h,
    zIndex,
    pointerEvents: edit ? "auto" : "none",
    overflow: edit ? "visible" : "hidden",
    touchAction: edit ? "none" : undefined,
  };

  return (
    <div
      ref={frameRef}
      data-testid={edit ? `runtime-edit-frame-${widget.id}` : "runtime-widget-frame"}
      data-widget-id={widget.id}
      data-preview-active={edit?.previewActive ? "true" : undefined}
      className={edit ? `osv3-widget-frame ${edit.selected ? "osv3-widget-frame--selected" : ""}` : undefined}
      style={frameStyle}
      role={edit ? "button" : undefined}
      tabIndex={edit ? 0 : undefined}
      aria-label={edit ? (widget.name?.trim() || widget.type) : undefined}
      onPointerDown={edit ? (event) => edit.onFramePointerDown(widget.id, event) : undefined}
      onLostPointerCapture={edit ? (event) => edit.onLostPointerCapture(event.nativeEvent) : undefined}
      onKeyDown={edit ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          edit.onSelect(widget.id);
        }
      } : undefined}
    >
      {edit?.selected ? <div className="osv3-widget-frame__chrome" aria-hidden="true" /> : null}
      {edit?.selected
        ? RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              data-testid={`runtime-resize-handle-${handle}-${widget.id}`}
              className={`osv3-resize-handle osv3-resize-handle--${handle}`}
              aria-label={t("studio.v3.canvas.resizeHandleAria").replace("{handle}", handle)}
              onPointerDown={(event) => edit.onResizePointerDown(widget.id, handle, event)}
              onLostPointerCapture={(event) => edit.onLostPointerCapture(event.nativeEvent)}
            />
          ))
        : null}
      <div className={edit ? "osv3-widget-frame__visual" : undefined} style={edit ? undefined : { width: "100%", height: "100%" }}>
        <WidgetVisualViewport
          widgetType={widget.type}
          layout={frameGeometry}
          testId={`runtime-widget-viewport-${widget.id}`}
        >
          <WidgetVisualHost
            widget={widget}
            snapshot={snapshot}
            renderMode={renderMode}
            onDiagnostic={onDiagnostic}
            diagnostics={diagnostics}
            runtime={{ engineerPresentation, engineerSubtitlesEnabled }}
          />
        </WidgetVisualViewport>
      </div>
    </div>
  );
}
