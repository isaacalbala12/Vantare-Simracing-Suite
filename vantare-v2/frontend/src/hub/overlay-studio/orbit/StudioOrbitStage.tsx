import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { resolveLayoutViewport } from "../../../overlay/core/layout-viewport";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { WidgetDiagnosticCollector } from "../../../overlay/core/widget-diagnostics";
import { canMutateWidget } from "../access/studio-access";
import { STUDIO_WIDGET_ACCESS_MESSAGE_KEY } from "../studio-v3-i18n";
import { CanvasGuides } from "../canvas/CanvasGuides";
import { StudioWidgetFrame } from "../canvas/StudioWidgetFrame";
import { resolveCanvasBackground } from "../canvas/canvas-backgrounds";
import { clientToLogical } from "../canvas/canvas-geometry";
import { useCanvasInteraction } from "../canvas/useCanvasInteraction";
import { useStudioTelemetrySnapshot } from "../canvas/StudioTelemetryProvider";
import { useStudioDocument, useStudioPreview } from "../state/studio-store";
import { fill, widgetLabel } from "./studio-orbit-model";

/** Area segura del prototipo: 4.5 % del lado corto (`.safe-area { inset: 4.5% }`). */
const SAFE_AREA_INSET = "4.5%";

function sortByZIndex(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

export type StudioOrbitStageProps = {
  diagnostics?: WidgetDiagnosticCollector;
  onPointer(point: { x: number; y: number } | null): void;
};

/**
 * Lienzo Orbit del Studio (`06 § Overlays Studio`).
 *
 * Cambia la caja —`stage-wrap` con scroll, `stage` 16:9 con
 * `container-type: inline-size`— pero no la mecanica: los widgets los pinta
 * `StudioWidgetFrame` y el arrastre/redimensionado sale de
 * `useCanvasInteraction`, exactamente los mismos que usa `StudioCanvas`.
 */
export function StudioOrbitStage(props: StudioOrbitStageProps): React.ReactElement {
  const { diagnostics, onPointer } = props;
  const { t } = useI18n();
  const {
    access,
    document,
    activeLayout,
    activeSession,
    selectedWidgetId,
    selectWidget,
    dispatch,
    notifyAccessDenied,
  } = useStudioDocument();
  const { preview } = useStudioPreview();
  const liveSnapshot = useStudioTelemetrySnapshot();
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const layoutViewport = resolveLayoutViewport(document ?? {});

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      if (width > 0) setStageWidth((current) => (current === width ? current : width));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // El `stage` ya tiene la proporcion del documento por CSS: la escala del plano
  // logico es su ancho medido dividido por el ancho logico. No hay una segunda
  // fuente de verdad para el zoom.
  const scale = stageWidth > 0 ? stageWidth / layoutViewport.width : 0;
  const ready = stageWidth > 0 && document !== null;

  const widgets = useMemo(
    () => sortByZIndex(activeLayout?.widgets ?? []),
    [activeLayout?.widgets],
  );

  const background = resolveCanvasBackground(preview.backgroundId);

  const canMutateLayout = useCallback(
    (widget: WidgetInstanceV3) => canMutateWidget(access, widget),
    [access],
  );
  const onLayoutBlocked = useCallback(() => {
    notifyAccessDenied(t(STUDIO_WIDGET_ACCESS_MESSAGE_KEY));
  }, [notifyAccessDenied, t]);

  const interaction = useCanvasInteraction({
    widgets,
    session: activeSession,
    scale,
    sceneRef,
    selectedWidgetId,
    layoutViewport,
    dispatch,
    selectWidget,
    canMutateLayout,
    onLayoutBlocked,
  });

  // Durante un arrastre los widgets se congelan en el ultimo snapshot: repintar
  // su contenido a 30 Hz mientras se mueve el marco es trabajo tirado. La foto
  // se toma en el efecto de transicion, no en render, para no leer una ref
  // mientras se pinta (`react-hooks/refs`).
  const interacting = interaction.interaction.kind !== "idle";
  const latestSnapshotRef = useRef(liveSnapshot);
  const [snapshotOverride, setSnapshotOverride] = useState<TelemetrySnapshot | undefined>(undefined);
  useEffect(() => {
    latestSnapshotRef.current = liveSnapshot;
  }, [liveSnapshot]);
  useEffect(() => {
    setSnapshotOverride(interacting ? latestSnapshotRef.current : undefined);
  }, [interacting]);

  const selected = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  const selectedLayout = selected ? interaction.resolveLayout(selected) : null;

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = sceneRef.current?.getBoundingClientRect();
      if (!rect || scale <= 0) return;
      const logical = clientToLogical({ x: event.clientX, y: event.clientY }, rect, scale);
      onPointer({ x: Math.round(logical.x), y: Math.round(logical.y) });
    },
    [onPointer, scale],
  );

  return (
    <div
      className="orbit-studio-stage-wrap"
      data-testid="orbit-studio-stage-wrap"
      onPointerDown={() => {
        if (interaction.interaction.kind === "idle") selectWidget(null);
      }}
      onPointerLeave={() => onPointer(null)}
      onPointerMove={handlePointerMove}
    >
      <div
        aria-label={t("studio.stage.aria")}
        className={`orbit-studio-stage ${background.className}`}
        data-safe={preview.safeArea ? "true" : undefined}
        data-testid="orbit-studio-stage"
        data-zoom={String(preview.zoom)}
        ref={stageRef}
        style={{
          aspectRatio: `${layoutViewport.width} / ${layoutViewport.height}`,
          width: preview.zoom === "fit" ? undefined : `${(preview.zoom / 100) * 100}%`,
        }}
      >
        <span className="orbit-studio-stage__label">
          {fill(t("studio.stage.label"), { w: layoutViewport.width, h: layoutViewport.height })}
        </span>
        {preview.safeArea ? (
          <div
            className="orbit-studio-stage__safe"
            data-testid="orbit-studio-safe-area"
            style={{ inset: SAFE_AREA_INSET }}
          >
            <span>{t("studio.stage.safeArea")}</span>
          </div>
        ) : null}

        <div
          className="orbit-studio-scene"
          data-testid="orbit-studio-scene"
          ref={sceneRef}
          style={{
            width: `${layoutViewport.width}px`,
            height: `${layoutViewport.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            visibility: ready ? undefined : "hidden",
          }}
        >
          <CanvasGuides guides={interaction.guides} />
          {widgets.map((widget) => (
            <StudioWidgetFrame
              diagnostics={diagnostics}
              key={widget.id}
              layout={interaction.resolveLayout(widget)}
              onFramePointerDown={interaction.onFramePointerDown}
              onLostPointerCapture={interaction.onLostPointerCapture}
              onResizePointerDown={interaction.onResizePointerDown}
              onSelect={selectWidget}
              previewActive={interaction.isWidgetPreviewActive(widget.id)}
              selected={selectedWidgetId === widget.id}
              snapshotOverride={snapshotOverride}
              widget={widget}
            />
          ))}
          {selected && selectedLayout ? (
            <span
              className="orbit-studio-scene__tag"
              data-testid="orbit-studio-selection-tag"
              style={{
                left: `${selectedLayout.x}px`,
                top: `${selectedLayout.y}px`,
                transform: `translateY(-100%) scale(${scale > 0 ? 1 / scale : 1})`,
                transformOrigin: "left bottom",
              }}
            >
              {widgetLabel(selected)} · {Math.round(selectedLayout.w)} ×{" "}
              {Math.round(selectedLayout.h)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
