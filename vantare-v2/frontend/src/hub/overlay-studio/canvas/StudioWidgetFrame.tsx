import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  applyStudioFrameLayoutPreview,
  getStudioFrameLayoutPreview,
  registerStudioFrameElement,
  resolveStudioFrameGeometry,
} from './canvas-frame-preview';
import type { WidgetInstanceV3, WidgetLayoutV3 } from '../../../overlay/core/profile-document';
import type { TelemetrySnapshot } from '../../../overlay/core/telemetry-snapshot';
import type { WidgetDiagnosticCollector } from '../../../overlay/core/widget-diagnostics';
import { WidgetVisualHost } from '../../../overlay/core/WidgetVisualHost';
import { WidgetVisualViewport } from '../../../overlay/core/WidgetVisualViewport';
import { widgetTypeRegistry } from '../../../overlay/core/widget-registry';
import { useRateLimitedTelemetry } from '../../../overlay/runtime/use-rate-limited-telemetry';
import { useI18n } from '../../../i18n/I18nProvider';
import type { ResizeHandle } from './canvas-resize';
import { useSelectionFit } from './useSelectionFit';
import { useStudioTelemetryCoordinator } from './studio-telemetry';

const MemoWidgetVisualHost = memo(WidgetVisualHost);

function layoutsEqual(left: WidgetLayoutV3, right: WidgetLayoutV3): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h &&
    left.zIndex === right.zIndex &&
    left.aspectLocked === right.aspectLocked
  );
}

const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export type StudioWidgetFrameProps = {
  widget: WidgetInstanceV3;
  layout: WidgetLayoutV3;
  previewActive?: boolean;
  selected: boolean;
  snapshotOverride?: TelemetrySnapshot;
  onSelect(widgetId: string): void;
  onFramePointerDown?(widgetId: string, event: React.PointerEvent<HTMLElement>): void;
  onResizePointerDown?(
    widgetId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ): void;
  onLostPointerCapture?(event: PointerEvent): void;
  diagnostics?: WidgetDiagnosticCollector;
  /**
   * Cine el marco de seleccion y los tiradores a la caja realmente pintada por
   * el widget en vez de a la del documento (`briefing 04 · A1`). Lo activa la
   * piel Orbit; el lienzo V3 clasico lo deja apagado y no cambia.
   */
  fitSelectionToContent?: boolean;
};

function StudioWidgetFrameComponent(props: StudioWidgetFrameProps): React.ReactElement {
  const {
    widget,
    layout,
    previewActive = false,
    selected,
    snapshotOverride,
    onSelect,
    onFramePointerDown,
    onResizePointerDown,
    onLostPointerCapture,
    diagnostics,
    fitSelectionToContent = false,
  } = props;
  const { t } = useI18n();
  const coordinator = useStudioTelemetryCoordinator();
  const rateLimitedSnapshot = useRateLimitedTelemetry(coordinator, widget.behavior.updateHz);
  const snapshot = snapshotOverride ?? rateLimitedSnapshot;
  const frameRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const frameGeometry = resolveStudioFrameGeometry(widget.id, layout, previewActive);
  const resizeHandles =
    widgetTypeRegistry.get(widget.type).capabilities.resizeMode === 'horizontal-only'
      ? (['e', 'w'] as const)
      : RESIZE_HANDLES;

  useLayoutEffect(() => {
    registerStudioFrameElement(widget.id, frameRef.current);
    return () => registerStudioFrameElement(widget.id, null);
  }, [widget.id]);

  useLayoutEffect(() => {
    if (!previewActive) {
      return;
    }
    const previewLayout = getStudioFrameLayoutPreview(widget.id);
    if (!previewLayout) {
      return;
    }
    applyStudioFrameLayoutPreview(widget.id, previewLayout);
  });

  useSelectionFit({
    enabled: fitSelectionToContent && selected,
    frameRef,
    selectionRef,
    deps: [
      widget.id,
      widget.visual,
      widget.content,
      frameGeometry.w,
      frameGeometry.h,
      previewActive,
    ],
  });

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: `${frameGeometry.x}px`,
    top: `${frameGeometry.y}px`,
    width: `${frameGeometry.w}px`,
    height: `${frameGeometry.h}px`,
    zIndex: frameGeometry.zIndex,
  };

  const frameClassName = [
    'osv3-widget-frame',
    selected ? 'osv3-widget-frame--selected' : '',
    previewActive ? 'osv3-widget-frame--interacting' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={frameRef}
      data-testid={`studio-widget-frame-${widget.id}`}
      data-preview-active={previewActive ? 'true' : undefined}
      className={frameClassName}
      style={frameStyle}
      role="button"
      tabIndex={0}
      aria-label={`${widget.name?.trim() || widget.type} (${widget.type}, ${widget.visual.systemId}, ${widget.behavior.enabled ? t('studio.v3.widgetList.status.active') : t('studio.v3.widgetList.status.hidden')})`}
      onPointerDown={(event) => {
        if (onFramePointerDown) {
          onFramePointerDown(widget.id, event);
          return;
        }
        event.stopPropagation();
        onSelect(widget.id);
      }}
      onLostPointerCapture={(event) => onLostPointerCapture?.(event.nativeEvent)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(widget.id);
        }
      }}
    >
      {/* Envoltorio de seleccion: `inset: 0` por defecto —la caja del
          documento, como siempre— y cenido a la caja pintada cuando la piel lo
          pide. Marco, tiradores y ancla de la etiqueta cuelgan de el, asi que
          los tres se mueven juntos por construccion. */}
      {selected ? (
        <div
          ref={selectionRef}
          data-testid={`studio-widget-selection-${widget.id}`}
          data-widget-selection="true"
          className="osv3-widget-frame__selection"
        >
          <div
            data-testid={`studio-widget-frame-chrome-${widget.id}`}
            className="osv3-widget-frame__chrome"
          />
          {onResizePointerDown
            ? resizeHandles.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  data-testid={`studio-resize-handle-${handle}-${widget.id}`}
                  className={`osv3-resize-handle osv3-resize-handle--${handle}`}
                  aria-label={t('studio.v3.canvas.resizeHandleAria').replace('{handle}', handle)}
                  onPointerDown={(event) => onResizePointerDown(widget.id, handle, event)}
                  onLostPointerCapture={(event) => onLostPointerCapture?.(event.nativeEvent)}
                />
              ))
            : null}
        </div>
      ) : null}
      {!widget.behavior.enabled ? (
        <span
          data-testid={`studio-widget-hidden-badge-${widget.id}`}
          className="osv3-widget-frame__hidden-badge"
        >
          {t('studio.v3.canvas.widgetHidden')}
        </span>
      ) : null}
      <div data-testid={`studio-widget-visual-${widget.id}`} className="osv3-widget-frame__visual">
        <WidgetVisualViewport
          widgetType={widget.type}
          layout={frameGeometry}
          testId={`studio-widget-viewport-${widget.id}`}
        >
          <MemoWidgetVisualHost
            widget={widget}
            snapshot={snapshot}
            renderMode="studio"
            diagnostics={diagnostics}
          />
        </WidgetVisualViewport>
      </div>
    </div>
  );
}

export const StudioWidgetFrame = memo(
  StudioWidgetFrameComponent,
  (previous, next) =>
    previous.widget === next.widget &&
    layoutsEqual(previous.layout, next.layout) &&
    previous.previewActive === next.previewActive &&
    previous.selected === next.selected &&
    previous.snapshotOverride === next.snapshotOverride &&
    previous.onSelect === next.onSelect &&
    previous.onFramePointerDown === next.onFramePointerDown &&
    previous.onResizePointerDown === next.onResizePointerDown &&
    previous.onLostPointerCapture === next.onLostPointerCapture &&
    previous.diagnostics === next.diagnostics &&
    previous.fitSelectionToContent === next.fitSelectionToContent,
);
