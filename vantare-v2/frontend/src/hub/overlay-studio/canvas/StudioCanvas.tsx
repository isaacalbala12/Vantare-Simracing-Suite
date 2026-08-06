import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDiagnosticCollector } from "../../../overlay/core/widget-diagnostics";
import { canMutateWidget } from "../access/studio-access";
import { useI18n } from "../../../i18n/I18nProvider";
import { STUDIO_WIDGET_ACCESS_MESSAGE_KEY } from "../studio-v3-i18n";
import { getStudioHotkey } from "../state/studio-hotkeys";
import { useStudioDocument, useStudioPreview } from "../state/studio-store";
import { CANVAS_HEIGHT, CANVAS_WIDTH, clientToLogical, resolveCanvasScale } from "./canvas-geometry";
import { resolveCanvasBackground, safeAreaInsets } from "./canvas-backgrounds";
import { CanvasActionBar } from "./CanvasActionBar";
import { CanvasToolbar } from "./CanvasToolbar";
import { PreviewSourceControls } from "./PreviewSourceControls";
import { CanvasGuides } from "./CanvasGuides";
import { StudioWidgetFrame } from "./StudioWidgetFrame";
import { useStudioTelemetryLiveAvailable, useStudioTelemetrySnapshot } from "./StudioTelemetryProvider";
import { useCanvasInteraction } from "./useCanvasInteraction";
import {
  buildWidgetAction,
  buildWidgetMoveCommand,
  executeWidgetAction,
  findWidgetsAtPoint,
  mapHotkeyToWidgetAction,
} from "./widget-actions";
import { WidgetContextMenu, type WidgetContextMenuState } from "./WidgetContextMenu";

function sortWidgetsByZIndex(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

export type StudioCanvasProps = {
  onOpenBrowserView?(): void;
  diagnostics?: WidgetDiagnosticCollector;
};

export function StudioCanvas(props: StudioCanvasProps = {}): React.ReactElement {
  const { onOpenBrowserView, diagnostics } = props;
  const { t } = useI18n();
  const {
    access,
    document,
    activeLayout,
    activeSession,
    selectedWidgetId,
    savedDocument,
    selectWidget,
    dispatch,
    notifyAccessDenied,
  } = useStudioDocument();
  const { preview, setPreview } = useStudioPreview();
  const liveAvailable = useStudioTelemetryLiveAvailable();
  const liveSnapshot = useStudioTelemetrySnapshot();
  const snapshotDuringInteractionRef = useRef(liveSnapshot);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  // null mientras no se haya podido medir de verdad. El valor inicial anterior
  // fingia que el contenedor media lo que el lienzo, que con "fit" da escala 1:
  // el lienzo se pintaba a 1920x1080 dentro de un area mas pequena y, con el
  // margin:auto del contenedor, lo visible era su parte central. De ahi que los
  // widgets aparecieran centrados un instante y luego saltaran a su sitio
  // cambiando de tamano.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<WidgetContextMenuState | null>(null);

  // useLayoutEffect y no useEffect: la medida tiene que ocurrir antes de que el
  // navegador pinte. El estado inicial finge que el contenedor mide lo que el
  // lienzo, 1920x1080, asi que con "fit" la primera escala sale 1 y los widgets
  // se dibujan a tamano real -- casi el doble del que les toca -- hasta que la
  // medida real llega. Ese fotograma a escala equivocada era el salto al abrir
  // Overlay Studio.
  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      // Sin medida no se inventa una: en desarrollo el CSS entra de forma
      // asincrona y el contenedor puede valer 0 en el primer layout.
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      setContainerSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // El lienzo espera a dos cosas antes de pintarse: saber cuanto mide y tener
  // el perfil. El perfil llega de forma asincrona, asi que sin esta condicion
  // el lienzo aparecia vacio y los widgets entraban despues. Se distingue "aun
  // no ha llegado" de "no tiene widgets": un perfil sin widgets es valido y
  // debe pintarse vacio.
  const ready = containerSize !== null && document !== null;
  const scale = resolveCanvasScale({
    containerWidth: containerSize?.width ?? CANVAS_WIDTH,
    containerHeight: containerSize?.height ?? CANVAS_HEIGHT,
    zoom: preview.zoom,
  });
  const displayWidth = Math.round(CANVAS_WIDTH * scale);
  const displayHeight = Math.round(CANVAS_HEIGHT * scale);

  const widgets = useMemo(
    () => sortWidgetsByZIndex(activeLayout?.widgets ?? []),
    [activeLayout?.widgets],
  );

  const background = resolveCanvasBackground(preview.backgroundId);
  const safeInsets = safeAreaInsets(CANVAS_WIDTH, CANVAS_HEIGHT);

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
    dispatch,
    selectWidget,
    canMutateLayout,
    onLayoutBlocked,
  });

  const isCanvasInteracting = interaction.interaction.kind !== "idle";

  useEffect(() => {
    if (!isCanvasInteracting) {
      snapshotDuringInteractionRef.current = liveSnapshot;
    }
  }, [isCanvasInteracting, liveSnapshot]);

  const snapshotOverride = isCanvasInteracting ? snapshotDuringInteractionRef.current : undefined;

  const confirmDelete = useCallback((message: string) => window.confirm(message), []);

  const stopViewportDeselect = useCallback((event: React.PointerEvent) => {
    event.stopPropagation();
  }, []);

  const runHotkeyAction = useCallback((event: KeyboardEvent) => {
    if (!selectedWidgetId || !savedDocument || interaction.interaction.kind !== "idle") {
      return;
    }

    const hotkey = getStudioHotkey(event);
    if (!hotkey) {
      return;
    }

    const mapped = mapHotkeyToWidgetAction(hotkey);
    if (mapped === "keyboard-move") {
      if (
        hotkey !== "move-up"
        && hotkey !== "move-down"
        && hotkey !== "move-left"
        && hotkey !== "move-right"
      ) {
        return;
      }
      const command = buildWidgetMoveCommand({
        session: activeSession,
        widgetIds: [selectedWidgetId],
        hotkey,
        shiftKey: event.shiftKey,
        widgets,
      });
      if (command) {
        event.preventDefault();
        dispatch(command);
      }
      return;
    }

    if (!mapped) {
      return;
    }

    const built = buildWidgetAction({
      actionId: mapped,
      session: activeSession,
      widgetIds: [selectedWidgetId],
      widgets,
      savedDocument,
    });
    if (!built.command) {
      return;
    }

    event.preventDefault();
    executeWidgetAction({
      actionId: mapped,
      session: activeSession,
      widgetIds: [selectedWidgetId],
      widgets,
      savedDocument,
      dispatch,
      selectWidget,
      confirmDelete,
    });
  }, [
    activeSession,
    confirmDelete,
    dispatch,
    interaction.interaction.kind,
    savedDocument,
    selectWidget,
    selectedWidgetId,
    widgets,
  ]);

  useEffect(() => {
    window.addEventListener("keydown", runHotkeyAction);
    return () => window.removeEventListener("keydown", runHotkeyAction);
  }, [runHotkeyAction]);

  const handleSceneContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!savedDocument) {
      return;
    }
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    const logical = clientToLogical({ x: event.clientX, y: event.clientY }, rect, scale);
    const hits = findWidgetsAtPoint(widgets, logical);
    if (hits.length === 0) {
      setContextMenu(null);
      return;
    }

    const target = hits[0];
    selectWidget(target.id);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      widgetId: target.id,
      layerWidgetIds: hits.map((widget) => widget.id),
    });
  }, [savedDocument, scale, selectWidget, widgets]);

  return (
    <div
      ref={viewportRef}
      data-testid="studio-canvas-viewport"
      className="osv3-canvas-viewport"
      data-selected-widget-id={selectedWidgetId ?? ""}
      data-interaction={interaction.interaction.kind}
      onPointerDown={() => {
        if (interaction.interaction.kind === "idle") {
          selectWidget(null);
          setContextMenu(null);
        }
      }}
    >
      <div onPointerDown={stopViewportDeselect}>
        <CanvasToolbar preview={preview} onPreviewChange={setPreview} />
      </div>
      <div
        data-testid="studio-canvas-action-bar-slot"
        className="osv3-canvas-action-bar-slot"
        aria-hidden={!selectedWidgetId}
        onPointerDown={stopViewportDeselect}
      >
        {savedDocument && widgets.length > 0 ? (
          selectedWidgetId ? (
            <CanvasActionBar
              widgetId={selectedWidgetId}
              session={activeSession}
              widgets={widgets}
              savedDocument={savedDocument}
              dispatch={dispatch}
              selectWidget={selectWidget}
              confirmDelete={confirmDelete}
            />
          ) : (
            <CanvasActionBar
              inert
              widgetId={widgets[0].id}
              session={activeSession}
              widgets={widgets}
              savedDocument={savedDocument}
              dispatch={dispatch}
              selectWidget={selectWidget}
              confirmDelete={confirmDelete}
            />
          )
        ) : null}
      </div>
      {/* El fondo se dibuja una sola vez, aqui, y cubre todo el area de trabajo.
          El lienzo es 16:9 y el area no, asi que al ajustar siempre sobra
          espacio arriba y abajo; pintarlo tambien en el lienzo dejaba ese
          sobrante como bandas y duplicaba el degradado a dos escalas, con una
          costura visible al encoger la ventana. El lienzo queda delimitado por
          su sombra y su borde, no por un cambio de fondo. */}
      <div
        ref={stageRef}
        data-testid="studio-canvas-stage"
        className={`osv3-canvas-stage ${background.className}`}
      >
        <div
          className="osv3-canvas-scene-stage"
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            // Oculto hasta estar listo: se mantiene en el DOM para no alterar
            // el flujo, pero no llega a pintarse a una escala inventada ni sin
            // los widgets del perfil.
            visibility: ready ? undefined : "hidden",
          }}
        >
          <div
            ref={sceneRef}
            data-testid="studio-canvas-scene"
            className="osv3-canvas-scene"
            data-scale={String(scale)}
            style={{
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            onContextMenu={handleSceneContextMenu}
          >
            {preview.safeArea ? (
              <div
                data-testid="studio-safe-area-overlay"
                className="osv3-safe-area-overlay"
                style={{
                  top: `${safeInsets.top}px`,
                  right: `${safeInsets.right}px`,
                  bottom: `${safeInsets.bottom}px`,
                  left: `${safeInsets.left}px`,
                }}
              />
            ) : null}
            <CanvasGuides guides={interaction.guides} />
            {widgets.map((widget) => (
              <StudioWidgetFrame
                key={widget.id}
                widget={widget}
                layout={interaction.resolveLayout(widget)}
                previewActive={interaction.isWidgetPreviewActive(widget.id)}
                selected={selectedWidgetId === widget.id}
                snapshotOverride={snapshotOverride}
                onSelect={selectWidget}
                onFramePointerDown={interaction.onFramePointerDown}
                onResizePointerDown={interaction.onResizePointerDown}
                onLostPointerCapture={interaction.onLostPointerCapture}
                diagnostics={diagnostics}
              />
            ))}
          </div>
        </div>
      </div>
      <div onPointerDown={stopViewportDeselect}>
        <PreviewSourceControls
          preview={preview}
          liveAvailable={liveAvailable}
          onPreviewChange={setPreview}
          onOpenBrowserView={onOpenBrowserView}
        />
      </div>
      {savedDocument ? (
        <WidgetContextMenu
          menu={contextMenu}
          session={activeSession}
          widgets={widgets}
          savedDocument={savedDocument}
          dispatch={dispatch}
          selectWidget={selectWidget}
          confirmDelete={confirmDelete}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
