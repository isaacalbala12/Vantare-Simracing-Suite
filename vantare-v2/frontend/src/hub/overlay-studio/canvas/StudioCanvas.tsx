import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
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
};

export function StudioCanvas(props: StudioCanvasProps = {}): React.ReactElement {
  const { onOpenBrowserView } = props;
  const {
    activeLayout,
    activeSession,
    selectedWidgetId,
    savedDocument,
    selectWidget,
    dispatch,
  } = useStudioDocument();
  const { preview, setPreview } = useStudioPreview();
  const liveAvailable = useStudioTelemetryLiveAvailable();
  const liveSnapshot = useStudioTelemetrySnapshot();
  const snapshotDuringInteractionRef = useRef(liveSnapshot);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const [contextMenu, setContextMenu] = useState<WidgetContextMenuState | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      setContainerSize({
        width: node.clientWidth || CANVAS_WIDTH,
        height: node.clientHeight || CANVAS_HEIGHT,
      });
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

  const scale = resolveCanvasScale({
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
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

  const interaction = useCanvasInteraction({
    widgets,
    session: activeSession,
    scale,
    sceneRef,
    selectedWidgetId,
    dispatch,
    selectWidget,
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
      <div ref={stageRef} className="osv3-canvas-stage">
        <div
          className="osv3-canvas-scene-stage"
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
          }}
        >
          <div
            ref={sceneRef}
            data-testid="studio-canvas-scene"
            className={`osv3-canvas-scene ${background.className}`}
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
