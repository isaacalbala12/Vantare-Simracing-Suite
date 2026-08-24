import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { createPortal } from 'react-dom';
import { resolveLayoutViewport } from '../../../overlay/core/layout-viewport';
import type { WidgetInstanceV3 } from '../../../overlay/core/profile-document';
import type { TelemetrySnapshot } from '../../../overlay/core/telemetry-snapshot';
import type { WidgetDiagnosticCollector } from '../../../overlay/core/widget-diagnostics';
import { canMutateWidget } from '../access/studio-access';
import { STUDIO_WIDGET_ACCESS_MESSAGE_KEY } from '../studio-v3-i18n';
import { CanvasGuides } from '../canvas/CanvasGuides';
import { StudioWidgetFrame } from '../canvas/StudioWidgetFrame';
import { resolveCanvasBackground } from '../canvas/canvas-backgrounds';
import { clientToLogical } from '../canvas/canvas-geometry';
import { useCanvasInteraction } from '../canvas/useCanvasInteraction';
import { useStudioTelemetrySnapshot } from '../canvas/studio-telemetry';
import { useFontsReady } from '../canvas/use-fonts-ready';
import { useStudioDocument, useStudioPreview } from '../state/studio-store';
import { placeSelectionTag, type TagAnchor } from './selection-tag-placement';
import { fill, widgetLabel } from './studio-orbit-model';

/** Area segura del prototipo: 4.5 % del lado corto (`.safe-area { inset: 4.5% }`). */
const SAFE_AREA_INSET = '4.5%';

function sortByZIndex(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

/**
 * Caja de seleccion REAL del widget seleccionado (la que `useSelectionFit`
 * cine a lo pintado), leida del DOM en coordenadas del `stage`.
 */
function readSelectionAnchor(
  stage: HTMLElement,
  selectedWidgetId: string,
): TagAnchor | null {
  const frame = stage.querySelector<HTMLElement>(
    `[data-testid="studio-widget-frame-${CSS.escape(selectedWidgetId)}"]`,
  );
  const box = frame?.querySelector<HTMLElement>('[data-widget-selection]') ?? frame;
  if (!box) {
    return null;
  }
  const stageRect = stage.getBoundingClientRect();
  const rect = box.getBoundingClientRect();
  return {
    left: rect.left - stageRect.left,
    top: rect.top - stageRect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Colocacion de la etiqueta en coords LOCALES de la caja. La caja vive dentro
 * de la escena escalada, asi que el delta en pixeles del lienzo se expresa en
 * pixeles LOGICOS (la escala de la escena lo devuelve a su sitio sin
 * contra-transformaciones).
 */
function localTagPlacement(
  anchor: TagAnchor,
  placement: { left: number; top: number },
  scale: number,
): { left: number; top: number } {
  return {
    left: (placement.left - anchor.left) / scale,
    top: (placement.top - anchor.top) / scale,
  };
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
  // Los widgets pintan texto con metricas criticas: sin este gate, el swap de
  // fuentes reflowea las filas justo tras el primer pintado (el 'salto
  // inicial'). Con fuentes locales ready llega en milisegundos.
  const fontsReady = useFontsReady();
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  // El alto medido lo necesita la etiqueta de seleccion para decidir si cabe
  // arriba del widget; el ancho ya mandaba la escala del plano logico.
  const [stageHeight, setStageHeight] = useState(0);

  const layoutViewport = resolveLayoutViewport(document ?? {});

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (height > 0) setStageHeight((current) => (current === height ? current : height));
      if (width > 0) setStageWidth((current) => (current === width ? current : width));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
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

  const widgets = useMemo(() => sortByZIndex(activeLayout?.widgets ?? []), [activeLayout?.widgets]);

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
  const interacting = interaction.interaction.kind !== 'idle';
  const latestSnapshotRef = useRef(liveSnapshot);
  const [snapshotOverride, setSnapshotOverride] = useState<TelemetrySnapshot | undefined>(
    undefined,
  );
  useEffect(() => {
    latestSnapshotRef.current = liveSnapshot;
  }, [liveSnapshot]);
  useEffect(() => {
    setSnapshotOverride(interacting ? latestSnapshotRef.current : undefined);
  }, [interacting]);

  const selected = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  const selectedLayout = selected ? interaction.resolveLayout(selected) : null;

  // ---------------------------------------------------------------- etiqueta
  // La etiqueta se ancla a la caja de seleccion REAL del widget (la que
  // `useSelectionFit` cine a lo pintado), leida del DOM en coordenadas del
  // `stage`. Leerla del DOM es lo unico que sigue al widget durante un
  // arrastre: `resolveLayout` devuelve el layout comprometido y el marco se
  // mueve por estilo en linea, sin repintar React.
  const [tagSize, setTagSize] = useState({ width: 0, height: 0 });
  const tagRef = useRef<HTMLDivElement>(null);
  // Huesped del portal: vive dentro del envoltorio de seleccion del marco, asi
  // que el navegador mueve la etiqueta con el de forma atomica. El seguidor
  // solo corrige lo lento (clamp/lado), nunca el movimiento primario.
  const [tagHost, setTagHost] = useState<HTMLDivElement | null>(null);
  const handleTagHostRef = useCallback((node: HTMLDivElement | null) => {
    setTagHost(node);
  }, []);

  /**
   * Unica fuente de verdad de la posicion de la etiqueta: medir la caja en el
   * DOM y escribir coords logicas locales + lado. React NUNCA la coloca — si
   * lo hiciera, cualquier re-render ajeno al gesto (telemetria incluida)
   * reaplicaria una posicion stale y se veria como un salto.
   */
  const applyTagPosition = useCallback((): void => {
    const stage = stageRef.current;
    const node = tagRef.current;
    if (
      !stage ||
      !node ||
      !selectedWidgetId ||
      stageWidth <= 0 ||
      stageHeight <= 0 ||
      scale <= 0
    ) {
      return;
    }
    const box = readSelectionAnchor(stage, selectedWidgetId);
    if (!box) {
      return;
    }
    const placement = placeSelectionTag({
      anchor: box,
      tag: tagSize,
      stage: { width: stageWidth, height: stageHeight },
    });
    const local = localTagPlacement(box, placement, scale);
    node.style.left = `${local.left}px`;
    node.style.top = `${local.top}px`;
    node.setAttribute('data-place', placement.side);
    node.setAttribute('data-ready', 'true');
  }, [selectedWidgetId, tagSize, stageWidth, stageHeight, scale]);

  // Recoloca fuera del gesto: seleccion nueva, commit, zoom o resize del lienzo.
  useLayoutEffect(() => {
    applyTagPosition();
  }, [applyTagPosition, selectedLayout, preview.zoom, tagHost]);

  // Durante el arrastre/redimensionado el marco se mueve por estilo en linea y
  // la etiqueta, al ser hija de su caja via portal, se mueve con el gratis.
  // Este loop solo refresca el clamp/lado; sin setState por frame (un setState
  // aqui dejaria el stage entero re-renderizando durante todo el gesto).
  useEffect(() => {
    if (!interacting || typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    const tick = () => {
      applyTagPosition();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [interacting, applyTagPosition]);

  // La etiqueta se mide a si misma: su ancho depende del nombre del widget y
  // de si lleva el boton "Mostrar", y el recorte contra los bordes lo necesita.
  const measureTag = useCallback(() => {
    const node = tagRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setTagSize((current) =>
      Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
        ? current
        : { width: rect.width, height: rect.height },
    );
  }, []);

  useLayoutEffect(() => {
    measureTag();
  }, [measureTag, selectedWidgetId, selectedLayout, selected?.behavior.enabled, selected?.name]);

  // Sin `useCallback`: solo la usa la etiqueta, que no esta memoizada, y
  // memoizarla sobre un widget de la lista rompe el compilador de React.
  const showWidget = () => {
    if (!selected) return;
    dispatch({
      type: 'widget/behavior',
      session: activeSession,
      widgetIds: [selected.id],
      patch: { enabled: true },
    });
  };

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
        if (interaction.interaction.kind === 'idle') selectWidget(null);
      }}
      onPointerLeave={() => onPointer(null)}
      onPointerMove={handlePointerMove}
    >
      <div
        aria-label={t('studio.stage.aria')}
        className={`orbit-studio-stage ${background.className}`}
        data-safe={preview.safeArea ? 'true' : undefined}
        data-testid="orbit-studio-stage"
        data-zoom={String(preview.zoom)}
        ref={stageRef}
        style={{
          aspectRatio: `${layoutViewport.width} / ${layoutViewport.height}`,
          width: preview.zoom === 'fit' ? undefined : `${(preview.zoom / 100) * 100}%`,
        }}
      >
        <span className="orbit-studio-stage__label">
          {fill(t('studio.stage.label'), { w: layoutViewport.width, h: layoutViewport.height })}
        </span>
        {preview.safeArea ? (
          <div
            className="orbit-studio-stage__safe"
            data-testid="orbit-studio-safe-area"
            style={{ inset: SAFE_AREA_INSET }}
          >
            <span>{t('studio.stage.safeArea')}</span>
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
            transformOrigin: 'top left',
            visibility: ready ? undefined : 'hidden',
          }}
        >
          <CanvasGuides guides={interaction.guides} />
          {fontsReady
            ? widgets.map((widget) => (
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
                  selectionPortalRef={
                    selectedWidgetId === widget.id ? handleTagHostRef : undefined
                  }
                  snapshotOverride={snapshotOverride}
                  widget={widget}
                  fitSelectionToContent
                />
              ))
            : null}
        </div>

        {/* La etiqueta se monta via portal DENTRO de la caja de seleccion del
            marco: moverla es gratis (el navegador la mueve con el marco) y el
            seguidor solo corrige clamp/lado en coords locales. Se sigue
            midiendo y clampeando en pixeles del lienzo
            (`selection-tag-placement.ts`). */}
        {selected && selectedLayout && tagHost
          ? createPortal(
              <div
                className="orbit-studio-stage__tag"
                data-hidden={selected.behavior.enabled ? undefined : 'true'}
                data-place="above"
                data-testid="orbit-studio-selection-tag"
                ref={tagRef}
              >
                <span data-testid="orbit-studio-selection-tag-copy">
                  {widgetLabel(selected)} · {Math.round(selectedLayout.w)} ×{' '}
                  {Math.round(selectedLayout.h)}
                  {selected.behavior.enabled ? '' : ` · ${t('studio.stage.hiddenSuffix')}`}
                </span>
                {selected.behavior.enabled ? null : (
                  <button
                    className="orbit-studio-stage__tag-action"
                    data-testid="orbit-studio-selection-show"
                    onClick={showWidget}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    {t('studio.stage.show')}
                  </button>
                )}
              </div>,
              tagHost,
            )
          : null}
      </div>
    </div>
  );
}
